import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  commitTransaction,
  createLocalReq,
  getPayload,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'

import type { UserRole } from '@/access/roles'
import { lockAccounts } from '@/collections/Users/accountProvisioning'
import type { DomainCollection } from '@/collections/shared/domainCollections'
import { transitionDomainRecord } from '@/collections/shared/transitionDomainRecord'
import { authorizeScheduling } from '@/jobs/authorizeScheduling'
import { latestPublicationVersion } from '@/jobs/publicationRevision'
import config from '@/payload.config'
import * as officialStorage from '@/storage/officialStorage'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import { assertTestStorage } from '../helpers/assertTestStorage'
import {
  createDisposableAccount,
  disableAccount,
  removeObjects,
  seedFile,
  sha256Hex,
} from '../helpers/officialFileFixtures'

type Official = 'issuances' | 'reports'

describe('official publication preflight and locked file proof', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const orgs: number[] = []
  const related: { collection: DomainCollection | 'documents'; id: number }[] = []
  const tracker = { keys: [] as string[] }
  const extraAccounts: number[] = []
  const actor = (role: UserRole = 'publisher') => ({
    ...fixtures.users[role],
    collection: 'users' as const,
  })

  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })
  beforeAll(async () => {
    assertTestStorage(process.env.OFFICIAL_STORAGE_URL, process.env.OFFICIAL_STORAGE_BUCKET)
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    vi.restoreAllMocks()
    for (const { collection, id } of related.reverse()) {
      if (collection !== 'documents')
        await payload.db.deleteVersions({ collection, where: { parent: { equals: id } } })
      await payload.db.deleteOne({ collection, where: { id: { equals: id } } })
    }
    for (const id of orgs) {
      await payload.db.deleteVersions({
        collection: 'organizations',
        where: { parent: { equals: id } },
      })
      await payload.db.deleteOne({ collection: 'organizations', where: { id: { equals: id } } })
    }
    await removeObjects(tracker.keys)
    if (fixtures)
      await removeTestAccounts(payload, [
        ...Object.values(fixtures.users).map(({ id }) => id),
        ...extraAccounts,
      ])
  })

  const fresh = (user = actor()) => createLocalReq({ user }, payload)
  async function publishedOrg() {
    const org = await payload.create({
      collection: 'organizations',
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data: { name: `Synthetic publication org ${randomUUID()}`, kind: 'usg' },
    })
    orgs.push(org.id)
    await run('organizations', org.id)
    return org.id
  }
  async function proofOf(
    req: Awaited<ReturnType<typeof fresh>>,
    collection: DomainCollection,
    id: number,
  ) {
    const version = await latestPublicationVersion(req, collection, id)
    return { versionID: version.id, versionHash: version.hash }
  }
  async function run(
    collection: DomainCollection,
    id: number,
    action: 'publish' | 'withdraw' = 'publish',
  ) {
    const req = await fresh()
    return transitionDomainRecord(req, {
      collection,
      documentID: id,
      action,
      expected: await proofOf(req, collection, id),
    })
  }
  async function record(
    collection: Official,
    organization: number,
    mainDocument: number,
    attachments: number[] = [],
  ) {
    const doc = await payload.create({
      collection,
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data: {
        title: `Synthetic official ${randomUUID()}`,
        organization,
        type: collection === 'issuances' ? 'advisory' : 'financial',
        ...(collection === 'reports' ? { reportingPeriod: 'Synthetic source period' } : {}),
        mainDocument,
        attachments,
      },
    } as never)
    related.push({ collection, id: doc.id })
    return doc.id as number
  }
  const file = async (org: number, options?: Parameters<typeof seedFile>[3]) => {
    const seeded = await seedFile(payload, tracker, org, options)
    related.push({ collection: 'documents', id: seeded.id })
    return seeded
  }
  const unpublished = async (collection: Official, id: number) =>
    expect(
      await payload.findByID({ collection, id, overrideAccess: false, disableErrors: true }),
    ).toBeNull()
  const fetchCalls = () => vi.spyOn(globalThis, 'fetch')

  it.each(['issuances', 'reports'] as const)(
    'publishes_%s_only_after_every_main_and_attachment_is_independently_verified',
    async (collection) => {
      const org = await publishedOrg()
      const main = await file(org)
      const attachment = await file(org)
      const id = await record(collection, org, main.id, [attachment.id])
      const spy = fetchCalls()
      const expected = await proofOf(await fresh(), collection, id)
      await expect(
        transitionDomainRecord(await fresh(), {
          collection,
          documentID: id,
          action: 'publish',
          expected,
        }),
      ).resolves.toMatchObject({ alreadyApplied: false })
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3)
      const published = await payload.findByID({ collection, id, overrideAccess: false })
      expect(published._status).toBe('published')
      expect(JSON.stringify(published)).not.toContain(main.key)
      spy.mockClear()
      // An exact retry of the committed transition is receipt-safe and needs no provider I/O.
      await expect(
        transitionDomainRecord(await fresh(), {
          collection,
          documentID: id,
          action: 'publish',
          expected,
        }),
      ).resolves.toMatchObject({ alreadyApplied: true })
      expect(spy).not.toHaveBeenCalled()
    },
  )

  it('restores_a_historical_official_revision_only_with_the_same_file_proof', async () => {
    const org = await publishedOrg()
    const first = await file(org)
    const second = await file(org)
    const id = await record('issuances', org, first.id)
    const v1 = await proofOf(await fresh(), 'issuances', id)
    await run('issuances', id)
    await payload.update({
      collection: 'issuances',
      id,
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data: { mainDocument: second.id },
    })
    await run('issuances', id)
    // The restored revision references the first file: break it and the restore fails closed.
    await payload.db.updateOne({
      collection: 'documents',
      where: { id: { equals: first.id } },
      data: { sha256: sha256Hex(new Uint8Array([1, 2, 3])) },
    })
    const req = await fresh()
    await expect(
      transitionDomainRecord(req, {
        collection: 'issuances',
        documentID: id,
        action: 'restore',
        expected: await proofOf(req, 'issuances', id),
        restore: v1,
      }),
    ).rejects.toMatchObject({
      status: 400,
      data: { errors: [expect.objectContaining({ path: 'mainDocument' })] },
    })
    await payload.db.updateOne({
      collection: 'documents',
      where: { id: { equals: first.id } },
      data: { sha256: first.sha256 },
    })
    const retry = await fresh()
    await expect(
      transitionDomainRecord(retry, {
        collection: 'issuances',
        documentID: id,
        action: 'restore',
        expected: await proofOf(retry, 'issuances', id),
        restore: v1,
      }),
    ).resolves.toMatchObject({ action: 'restore', alreadyApplied: false })
  })

  describe('fails closed on unverifiable files', () => {
    let wrongOrg: { id: number; organization: number } | undefined
    const cases: [
      string,
      'mainDocument' | 'attachments',
      (org: number, other: number) => Promise<{ main: number; attachments: number[] }>,
    ][] = [
      [
        'pending main',
        'mainDocument',
        async (org) => ({ main: (await file(org, { state: 'pending' })).id, attachments: [] }),
      ],
      [
        'failed main',
        'mainDocument',
        async (org) => ({ main: (await file(org, { state: 'failed' })).id, attachments: [] }),
      ],
      // Draft saves already reject cross-organization files, so tamper with the row afterwards.
      [
        'wrong organization main',
        'mainDocument',
        async (org, other) => {
          const main = await file(org)
          wrongOrg = { id: main.id, organization: other }
          return { main: main.id, attachments: [] }
        },
      ],
      [
        'wrong organization attachment',
        'attachments',
        async (org, other) => {
          const attachment = await file(org)
          wrongOrg = { id: attachment.id, organization: other }
          return { main: (await file(org)).id, attachments: [attachment.id] }
        },
      ],
      [
        'unverified attachment',
        'attachments',
        async (org) => ({
          main: (await file(org)).id,
          attachments: [(await file(org, { state: 'pending' })).id],
        }),
      ],
      [
        'metadata checksum mismatch',
        'mainDocument',
        async (org) => ({
          main: (await file(org, { metadataSha: sha256Hex(new Uint8Array([9])) })).id,
          attachments: [],
        }),
      ],
      [
        'non-PDF stored bytes',
        'mainDocument',
        async (org) => ({
          main: (await file(org, { bytes: new TextEncoder().encode('not a pdf') })).id,
          attachments: [],
        }),
      ],
      [
        'tampered staging key',
        'mainDocument',
        async (org) => ({
          main: (await file(org, { key: `pending/${randomUUID()}.pdf`, writeObject: false })).id,
          attachments: [],
        }),
      ],
      [
        'traversal key',
        'mainDocument',
        async (org) => ({
          main: (await file(org, { key: 'ready/../../x.pdf', writeObject: false })).id,
          attachments: [],
        }),
      ],
    ]
    it.each(cases)('%s', async (_name, path, build) => {
      const org = await publishedOrg()
      const other = await publishedOrg()
      const { main, attachments } = await build(org, other)
      const id = await record('issuances', org, main, attachments)
      if (wrongOrg)
        await payload.db.updateOne({
          collection: 'documents',
          where: { id: { equals: wrongOrg.id } },
          data: { organization: wrongOrg.organization },
        })
      wrongOrg = undefined
      await expect(run('issuances', id)).rejects.toMatchObject({
        status: 400,
        data: { errors: expect.arrayContaining([expect.objectContaining({ path })]) },
      })
      await unpublished('issuances', id)
    })

    it('missing_object_and_unavailable_or_public_storage_deny_with_retryable_503', async () => {
      const org = await publishedOrg()
      const missing = await file(org, { writeObject: false })
      const id = await record('reports', org, missing.id)
      await expect(run('reports', id)).rejects.toMatchObject({ status: 503 })
      const good = await file(org)
      const ok = await record('reports', org, good.id)
      vi.spyOn(officialStorage, 'getOfficialStorage').mockReturnValue({
        ...officialStorage.getOfficialStorage(),
        assertPrivateBucket: async () => {
          throw new (await import('payload')).APIError(
            'Private document storage is unavailable.',
            503,
          )
        },
      })
      await expect(run('reports', ok)).rejects.toMatchObject({ status: 503 })
      await unpublished('reports', id)
      await unpublished('reports', ok)
    })

    it('saturated_verification_slots_deny_retryably_and_are_released', async () => {
      const org = await publishedOrg()
      const main = await file(org)
      const id = await record('issuances', org, main.id)
      const { acquireDocumentSlot } = await import('@/storage/documentLimits')
      const held = [acquireDocumentSlot(), acquireDocumentSlot()]
      await expect(run('issuances', id)).rejects.toMatchObject({ status: 503 })
      held.forEach((release) => release())
      await expect(run('issuances', id)).resolves.toMatchObject({ alreadyApplied: false })
    })

    it('saturated_delivery_does_not_block_publication_preflight', async () => {
      const org = await publishedOrg()
      const main = await file(org)
      const id = await record('issuances', org, main.id)
      const { acquireDocumentDeliverySlot } = await import('@/storage/documentLimits')
      const held = [acquireDocumentDeliverySlot(), acquireDocumentDeliverySlot()]
      try {
        await expect(run('issuances', id)).resolves.toMatchObject({ alreadyApplied: false })
      } finally {
        held.forEach((release) => release())
      }
    })
  })

  it('binds_the_request_proof_and_denies_joined_transactions_without_valid_preflight', async () => {
    const { preflightOfficialPublication } = await import('@/storage/officialPublication')
    const org = await publishedOrg()
    const a = await record('issuances', org, (await file(org)).id)
    const b = await record('issuances', org, (await file(org)).id)

    // Joined, never preflighted: fail closed.
    const joined = await fresh()
    await initTransaction(joined)
    const input = {
      collection: 'issuances' as const,
      documentID: a,
      action: 'publish' as const,
      expected: await proofOf(joined, 'issuances', a),
    }
    await expect(transitionDomainRecord(joined, input)).rejects.toMatchObject({ status: 400 })
    await killTransaction(joined)
    await unpublished('issuances', a)

    // Preflight can never run inside an open transaction.
    const open = await fresh()
    await initTransaction(open)
    await expect(preflightOfficialPublication(open, input)).rejects.toMatchObject({ status: 409 })
    await killTransaction(open)

    // A proof for record A cannot publish record B.
    const req = await fresh()
    await preflightOfficialPublication(req, input)
    await initTransaction(req)
    await expect(
      transitionDomainRecord(req, {
        ...input,
        documentID: b,
        expected: await proofOf(req, 'issuances', b),
      }),
    ).rejects.toMatchObject({ status: 400 })
    await killTransaction(req)
    await unpublished('issuances', b)

    // Preflight then joined publication succeeds, and the proof is single-use.
    const ok = await fresh()
    await preflightOfficialPublication(ok, input)
    await initTransaction(ok)
    await expect(transitionDomainRecord(ok, input)).resolves.toMatchObject({
      alreadyApplied: false,
    })
    await commitTransaction(ok)
    // The same request cannot reuse a consumed proof for another joined publication.
    await initTransaction(ok)
    await expect(
      transitionDomainRecord(ok, {
        ...input,
        documentID: b,
        expected: await proofOf(ok, 'issuances', b),
      }),
    ).rejects.toMatchObject({ status: 400 })
    await killTransaction(ok)
    await unpublished('issuances', b)
  })

  it('stale_or_revoked_state_after_preflight_is_denied_by_the_locked_recheck', async () => {
    const { preflightOfficialPublication } = await import('@/storage/officialPublication')
    const org = await publishedOrg()
    const main = await file(org)
    const id = await record('issuances', org, main.id)
    const publish = async (req: Awaited<ReturnType<typeof fresh>>) => ({
      collection: 'issuances' as const,
      documentID: id,
      action: 'publish' as const,
      expected: await proofOf(req, 'issuances', id),
    })

    // File revoked after preflight.
    let req = await fresh()
    let input = await publish(req)
    await preflightOfficialPublication(req, input)
    await payload.db.updateOne({
      collection: 'documents',
      where: { id: { equals: main.id } },
      data: { state: 'failed' },
    })
    await initTransaction(req)
    await expect(transitionDomainRecord(req, input)).rejects.toMatchObject({ status: 400 })
    await killTransaction(req)
    await payload.db.updateOne({
      collection: 'documents',
      where: { id: { equals: main.id } },
      data: { state: 'ready' },
    })

    // Replaced identity (checksum) after preflight.
    req = await fresh()
    input = await publish(req)
    await preflightOfficialPublication(req, input)
    await payload.db.updateOne({
      collection: 'documents',
      where: { id: { equals: main.id } },
      data: { sha256: sha256Hex(new Uint8Array([7])) },
    })
    await initTransaction(req)
    await expect(transitionDomainRecord(req, input)).rejects.toMatchObject({ status: 400 })
    await killTransaction(req)
    await payload.db.updateOne({
      collection: 'documents',
      where: { id: { equals: main.id } },
      data: { sha256: main.sha256 },
    })

    // Reference swapped to an unverified file in a newer revision.
    req = await fresh()
    input = await publish(req)
    await preflightOfficialPublication(req, input)
    const other = await file(org, { state: 'pending' })
    await payload.update({
      collection: 'issuances',
      id,
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data: { mainDocument: other.id },
    })
    await initTransaction(req)
    await expect(transitionDomainRecord(req, input)).rejects.toMatchObject({ status: 409 })
    await killTransaction(req)

    // Publisher revoked after preflight.
    await payload.update({
      collection: 'issuances',
      id,
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data: { mainDocument: main.id },
    })
    const account = await createDisposableAccount(payload, 'publisher')
    extraAccounts.push(account.id)
    req = await fresh({ ...account.user, collection: 'users' } as never)
    input = await publish(req)
    await preflightOfficialPublication(req, input)
    await disableAccount(payload, account.id)
    await initTransaction(req)
    await expect(transitionDomainRecord(req, input)).rejects.toMatchObject({ status: 403 })
    await killTransaction(req)
    await unpublished('issuances', id)
  })

  it('performs_provider_io_outside_and_database_rechecks_inside_the_global_editorial_lock', async () => {
    const org = await publishedOrg()
    const id = await record('issuances', org, (await file(org)).id, [(await file(org)).id])
    const held = async () =>
      Number(
        (
          await payload.db.pool.query(
            "select count(*)::int as n from pg_locks where locktype='advisory' and classid=20261020 and objid=1 and granted",
          )
        ).rows[0].n,
      )
    // Control: the observation sees the lock when it really is held.
    const probe = await fresh()
    await initTransaction(probe)
    await lockAccounts(probe)
    expect(await held()).toBe(1)
    await killTransaction(probe)
    expect(await held()).toBe(0)

    const realFetch = globalThis.fetch
    const samples: number[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
      samples.push(await held())
      return realFetch(...args)
    })
    await run('issuances', id)
    expect(samples.length).toBeGreaterThanOrEqual(3)
    expect(samples.every((count) => count === 0)).toBe(true)
  })

  it('shares_the_file_proof_with_manual_schedule_and_job_entry_boundaries', async () => {
    const org = await publishedOrg()
    const good = await file(org)
    const bad = await file(org, { state: 'pending' })
    const goodID = await record('issuances', org, good.id)
    const badID = await record('issuances', org, bad.id)
    const args = async (id: number) => {
      const req = await fresh()
      return {
        req,
        importMap: {},
        permissions: {},
        cookies: new Map(),
        doc: { relationTo: 'issuances' as const, value: String(id) },
        type: 'publish' as const,
        date: new Date(Date.now() + 60_000),
        expected: await proofOf(req, 'issuances', id),
      }
    }
    await expect(authorizeScheduling(await args(badID))).rejects.toMatchObject({ status: 400 })
    expect(
      (
        await payload.count({
          collection: 'payload-jobs',
          where: { 'input.documentID': { equals: badID } },
        })
      ).totalDocs,
    ).toBe(0)
    await expect(authorizeScheduling(await args(goodID))).resolves.toHaveProperty('message')
    const jobs = await payload.find({
      collection: 'payload-jobs',
      where: { 'input.documentID': { equals: goodID } },
    })
    expect(jobs.docs).toHaveLength(1)
    const job = jobs.docs[0]
    const { scheduledPublication } = await import('@/jobs/authorizePublication')
    const runner = await fresh()
    const handle = () =>
      scheduledPublication({ job, req: runner, input: job.input! } as Parameters<
        typeof scheduledPublication
      >[0])
    try {
      // Revoke the file between scheduling and execution: the job entry preflight denies it.
      await payload.db.updateOne({
        collection: 'documents',
        where: { id: { equals: good.id } },
        data: { state: 'failed' },
      })
      await expect(handle()).rejects.toMatchObject({ status: 400 })
      await unpublished('issuances', goodID)
      await payload.db.updateOne({
        collection: 'documents',
        where: { id: { equals: good.id } },
        data: { state: 'ready' },
      })
      await expect(handle()).resolves.toBeTruthy()
      expect(
        (await payload.findByID({ collection: 'issuances', id: goodID, overrideAccess: false }))
          ._status,
      ).toBe('published')
      // Receipt retry: no provider I/O and no second publication.
      const spy = fetchCalls()
      const versions = await payload.countVersions({
        collection: 'issuances',
        where: { parent: { equals: goodID } },
      })
      const stored = await payload.findByID({ collection: 'payload-jobs', id: job.id })
      await expect(
        scheduledPublication({ job: stored, req: runner, input: stored.input! } as Parameters<
          typeof scheduledPublication
        >[0]),
      ).resolves.toBeTruthy()
      expect(spy).not.toHaveBeenCalled()
      expect(
        (
          await payload.countVersions({
            collection: 'issuances',
            where: { parent: { equals: goodID } },
          })
        ).totalDocs,
      ).toBe(versions.totalDocs)
    } finally {
      await payload.delete({ collection: 'payload-jobs', id: job.id }).catch(() => undefined)
    }
  })
})
