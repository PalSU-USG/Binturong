import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createLocalReq,
  getPayload,
  handleEndpoints,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'
import { authorizeScheduling } from '@/jobs/authorizeScheduling'
import * as scheduling from '@/jobs/authorizeScheduling'
import { transitionDomainRecord } from '@/collections/shared/transitionDomainRecord'
import { latestPublicationVersion } from '@/jobs/publicationRevision'
import type { DomainCollection } from '@/collections/shared/domainCollections'
import { vi } from 'vitest'
import { GRAPHQL_POST } from '@payloadcms/next/routes'

import config from '@/payload.config'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import type { UserRole } from '@/access/roles'

describe('reviewed domain publication', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const ids: number[] = []
  const related: { collection: DomainCollection | 'documents'; id: number }[] = []
  const actor = (role: UserRole = 'publisher') => ({
    ...fixtures.users[role],
    collection: 'users' as const,
  })
  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    vi.useRealTimers()
    for (const { collection, id } of related.reverse()) {
      if (collection !== 'documents')
        await payload.db.deleteVersions({ collection, where: { parent: { equals: id } } })
      await payload.db.deleteOne({ collection, where: { id: { equals: id } } })
    }
    for (const id of ids) {
      await payload.db.deleteVersions({
        collection: 'organizations',
        where: { parent: { equals: id } },
      })
      await payload.db.deleteOne({ collection: 'organizations', where: { id: { equals: id } } })
    }
    if (fixtures)
      await removeTestAccounts(
        payload,
        Object.values(fixtures.users).map(({ id }) => id),
      )
  })
  const request = (path: string, role?: UserRole, data?: unknown) =>
    handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api/organizations${path}`, {
        method: data === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(role ? { Authorization: `JWT ${fixtures.tokens[role]}` } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      }),
    })
  async function draft(data: Record<string, unknown> = {}) {
    const doc = await payload.create({
      collection: 'organizations',
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data: { name: `Synthetic reviewed ${randomUUID()}`, kind: 'usg', ...data },
    })
    ids.push(doc.id)
    return doc
  }
  async function review(id: number) {
    const response = await request(`/${id}/review`, 'publisher')
    expect(response.status).toBe(200)
    return response.json()
  }
  async function create(collection: DomainCollection, data: Record<string, unknown>) {
    const doc = await payload.create({
      collection,
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data,
    })
    related.push({ collection, id: doc.id })
    return doc
  }
  async function transition(
    collection: DomainCollection,
    id: number,
    action: 'publish' | 'withdraw' = 'publish',
  ) {
    const req = await createLocalReq({ user: actor() }, payload)
    const version = await latestPublicationVersion(req, collection, id)
    return transitionDomainRecord(req, {
      collection,
      documentID: id,
      action,
      expected: { versionID: version.id, versionHash: version.hash },
    })
  }
  it('publishes_exact_saved_metadata_with_private_audit_and_idempotent_retry', async () => {
    const doc = await draft()
    const reviewed = await review(doc.id)
    expect(reviewed.candidate).toMatchObject({ id: doc.id, name: doc.name })
    expect(reviewed.expected).toMatchObject({
      versionID: expect.any(Number),
      versionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    const before = await payload.countVersions({
      collection: 'organizations',
      where: { parent: { equals: doc.id } },
    })
    const input = { action: 'publish', expected: reviewed.expected }
    const response = await request(`/${doc.id}/transition`, 'publisher', input)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      documentID: doc.id,
      action: 'publish',
      alreadyApplied: false,
    })
    const publicResponse = await request(`/${doc.id}`)
    expect(publicResponse.status).toBe(200)
    const published = await publicResponse.json()
    expect(published).toMatchObject({
      name: doc.name,
      _status: 'published',
      publishedAt: expect.any(String),
    })
    expect(published.lastTransition).toBeUndefined()
    const replay = await request(`/${doc.id}/transition`, 'publisher', input)
    expect(replay.status).toBe(200)
    expect(await replay.json()).toHaveProperty('alreadyApplied', true)
    expect(
      (
        await payload.countVersions({
          collection: 'organizations',
          where: { parent: { equals: doc.id } },
        })
      ).totalDocs,
    ).toBe(before.totalDocs + 1)
    const saved = await payload.findByID({
      collection: 'organizations',
      id: doc.id,
      user: actor(),
      overrideAccess: false,
    })
    expect(saved).toHaveProperty('lastTransition.actorID', fixtures.users.publisher.id)
  })
  it('denies_anonymous_review_and_editor_transition', async () => {
    const doc = await draft()
    expect((await request(`/${doc.id}/review`)).status).toBe(403)
    const reviewed = await review(doc.id)
    expect(
      (
        await request(`/${doc.id}/transition`, 'editor', {
          action: 'publish',
          expected: reviewed.expected,
        })
      ).status,
    ).toBe(403)
  })
  it('rejects_incomplete_saved_candidate_and_missing_or_stale_proof', async () => {
    const doc = await draft({ name: null })
    const reviewed = await review(doc.id)
    const invalid = await request(`/${doc.id}/transition`, 'publisher', {
      action: 'publish',
      expected: reviewed.expected,
    })
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).errors[0].data.errors).toContainEqual(
      expect.objectContaining({ path: 'name' }),
    )
    expect(
      (await request(`/${doc.id}/transition`, 'publisher', { action: 'publish' })).status,
    ).toBe(400)
    await payload.update({
      collection: 'organizations',
      id: doc.id,
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data: { name: 'Synthetic saved later' },
    })
    expect(
      (
        await request(`/${doc.id}/transition`, 'publisher', {
          action: 'publish',
          expected: reviewed.expected,
        })
      ).status,
    ).toBe(409)
  })
  it('withdraws_the_canonical_snapshot_preserves_first_publication_and_restores_reviewed_history', async () => {
    const doc = await draft()
    const original = await review(doc.id)
    expect(
      (
        await request(`/${doc.id}/transition`, 'publisher', {
          action: 'publish',
          expected: original.expected,
        })
      ).status,
    ).toBe(200)
    const first = await (await request(`/${doc.id}`)).json()
    await payload.update({
      collection: 'organizations',
      id: doc.id,
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data: { name: 'Synthetic unreviewed change' },
    })
    expect(await (await request(`/${doc.id}`)).json()).toMatchObject({
      name: doc.name,
      publishedAt: first.publishedAt,
    })
    const head = await review(doc.id)
    expect(
      (
        await request(`/${doc.id}/transition`, 'publisher', {
          action: 'withdraw',
          expected: head.expected,
        })
      ).status,
    ).toBe(200)
    expect((await request(`/${doc.id}`)).status).toBe(404)
    const withdrawn = await payload.findByID({
      collection: 'organizations',
      id: doc.id,
      overrideAccess: false,
      user: actor(),
    })
    expect(withdrawn).toMatchObject({
      name: doc.name,
      publishedAt: first.publishedAt,
      _status: 'draft',
    })
    const current = await review(doc.id)
    const target = await request(
      `/${doc.id}/review?versionID=${original.expected.versionID}`,
      'publisher',
    )
    expect(target.status).toBe(200)
    const historical = await target.json()
    expect(historical.candidate).toMatchObject({ name: doc.name })
    const input = { action: 'restore', expected: current.expected, restore: historical.reviewed }
    expect((await request(`/${doc.id}/transition`, 'publisher', input)).status).toBe(200)
    expect(
      await (await request(`/${doc.id}/transition`, 'publisher', input)).json(),
    ).toHaveProperty('alreadyApplied', true)
    expect(
      (await request(`/${doc.id}/transition`, 'publisher', { ...input, restore: head.expected }))
        .status,
    ).toBe(409)
    expect(await (await request(`/${doc.id}`)).json()).toMatchObject({
      name: doc.name,
      publishedAt: first.publishedAt,
    })
    await expect(
      payload.delete({
        collection: 'organizations',
        id: doc.id,
        user: actor('super_admin'),
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('serializes_identical_and_conflicting_transitions_without_duplicate_versions', async () => {
    const doc = await draft()
    const reviewed = await review(doc.id)
    const lock = await payload.db.pool.connect()
    let outcomes: Promise<Response[]> | undefined
    try {
      await lock.query('select pg_advisory_lock(20261020,1)')
      outcomes = Promise.all(
        [1, 2].map(() =>
          request(`/${doc.id}/transition`, 'publisher', {
            action: 'publish',
            expected: reviewed.expected,
          }),
        ),
      )
      await expect
        .poll(async () =>
          Number(
            (
              await payload.db.pool.query(
                "select count(*) from pg_locks where locktype='advisory' and classid=20261020 and objid=1 and not granted",
              )
            ).rows[0].count,
          ),
        )
        .toBeGreaterThanOrEqual(2)
    } finally {
      await lock.query('select pg_advisory_unlock(20261020,1)')
      lock.release()
    }
    const responses = await outcomes!
    expect(responses.map(({ status }) => status)).toEqual([200, 200])
    expect(
      (await Promise.all(responses.map((response) => response.json())))
        .map(({ alreadyApplied }) => alreadyApplied)
        .sort(),
    ).toEqual([false, true])
    expect(
      (
        await payload.countVersions({
          collection: 'organizations',
          where: { parent: { equals: doc.id } },
        })
      ).totalDocs,
    ).toBe(2)
    expect(
      (
        await request(`/${doc.id}/transition`, 'publisher', {
          action: 'withdraw',
          expected: reviewed.expected,
        })
      ).status,
    ).toBe(409)
  })
  it('protects_first_published_slug_after_native_generation_and_in_drafts', async () => {
    const doc = await draft()
    const reviewed = await review(doc.id)
    expect(
      (
        await request(`/${doc.id}/transition`, 'publisher', {
          action: 'publish',
          expected: reviewed.expected,
        })
      ).status,
    ).toBe(200)
    for (const data of [
      { slug: `synthetic-changed-${randomUUID()}` },
      { name: 'Synthetic forced slug', generateSlug: true },
    ])
      await expect(
        payload.update({
          collection: 'organizations',
          id: doc.id,
          draft: true,
          overrideAccess: false,
          user: actor('super_admin'),
          data,
        }),
      ).rejects.toMatchObject({
        status: 400,
        data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'slug' })]) },
      })
    await expect(
      payload.update({
        collection: 'organizations',
        id: doc.id,
        draft: true,
        overrideAccess: false,
        user: actor('editor'),
        data: { name: 'Synthetic permitted name change' },
      }),
    ).resolves.toHaveProperty('slug', doc.slug)
  })
  it('rolls_back_native_hook_failure_and_denies_capability_forgery_after_failure', async () => {
    const doc = await draft()
    const reviewed = await review(doc.id)
    const hooks = payload.collections.organizations.config.hooks.afterChange
    const failure: (typeof hooks)[number] = () => {
      throw new Error('Synthetic transition failure after write')
    }
    hooks.push(failure)
    try {
      expect(
        (
          await request(`/${doc.id}/transition`, 'publisher', {
            action: 'publish',
            expected: reviewed.expected,
          })
        ).status,
      ).toBe(500)
    } finally {
      hooks.splice(hooks.indexOf(failure), 1)
    }
    expect((await request(`/${doc.id}`)).status).toBe(404)
    expect(
      (
        await payload.countVersions({
          collection: 'organizations',
          where: { parent: { equals: doc.id } },
        })
      ).totalDocs,
    ).toBe(1)
    await expect(
      payload.update({
        collection: 'organizations',
        id: doc.id,
        draft: false,
        overrideAccess: true,
        user: actor('super_admin'),
        context: { domainTransition: true, isRestoringVersion: true },
        data: {
          name: doc.name,
          kind: doc.kind,
          slug: doc.slug,
          generateSlug: false,
          _status: 'published',
          lastTransition: { action: 'publish' },
        },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('requires_displayed_schedule_proof_and_runs_domain_jobs_with_atomic_receipts', async () => {
    const doc = await draft()
    const reviewed = await review(doc.id)
    const req = await createLocalReq({ user: actor() }, payload)
    const args = {
      req,
      importMap: {},
      permissions: {},
      cookies: new Map(),
      doc: { relationTo: 'organizations' as const, value: String(doc.id) },
      type: 'publish' as const,
      date: new Date(Date.now() + 60000),
    }
    await expect(authorizeScheduling(args)).rejects.toMatchObject({ status: 400 })
    await expect(
      authorizeScheduling({
        ...args,
        expected: { ...reviewed.expected, versionHash: '0'.repeat(64) },
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      authorizeScheduling({ ...args, expected: reviewed.expected }),
    ).resolves.toHaveProperty('message')
    const jobs = await payload.find({
      collection: 'payload-jobs',
      where: { 'input.documentID': { equals: doc.id } },
    })
    expect(jobs.docs).toHaveLength(1)
    const job = jobs.docs[0]
    try {
      const { scheduledPublication } = await import('@/jobs/authorizePublication')
      const run = () =>
        scheduledPublication({ job, req, input: job.input! } as Parameters<
          typeof scheduledPublication
        >[0])
      await run()
      const after = await payload.countVersions({
        collection: 'organizations',
        where: { parent: { equals: doc.id } },
      })
      await run()
      expect(
        (
          await payload.countVersions({
            collection: 'organizations',
            where: { parent: { equals: doc.id } },
          })
        ).totalDocs,
      ).toBe(after.totalDocs)
      expect((await request(`/${doc.id}`)).status).toBe(200)
    } finally {
      await payload.delete({ collection: 'payload-jobs', id: job.id })
    }
  })
  it('rolls_back_an_earlier_joined_write_when_native_hooks_kill_the_transaction', async () => {
    const doc = await draft()
    const req = await createLocalReq({ user: actor() }, payload)
    await initTransaction(req)
    const before = await payload.countVersions({
      collection: 'organizations',
      where: { parent: { equals: doc.id } },
    })
    await payload.update({
      collection: 'organizations',
      id: doc.id,
      draft: true,
      req,
      overrideAccess: false,
      data: { name: 'Synthetic transaction earlier write' },
    })
    const version = await latestPublicationVersion(req, 'organizations', doc.id)
    const hooks = payload.collections.organizations.config.hooks.afterChange
    const failure: (typeof hooks)[number] = async ({ req }) => {
      await killTransaction(req)
    }
    hooks.push(failure)
    try {
      await expect(
        transitionDomainRecord(req, {
          collection: 'organizations',
          documentID: doc.id,
          action: 'publish',
          expected: { versionID: version.id, versionHash: version.hash },
        }),
      ).rejects.toMatchObject({ status: 500 })
    } finally {
      hooks.splice(hooks.indexOf(failure), 1)
      await killTransaction(req)
    }
    expect(
      (
        await payload.countVersions({
          collection: 'organizations',
          where: { parent: { equals: doc.id } },
        })
      ).totalDocs,
    ).toBe(before.totalDocs)
    expect(await payload.findByID({ collection: 'organizations', id: doc.id })).toHaveProperty(
      'name',
      doc.name,
    )
  })
  it('protects_current_published_metadata_dependencies_and_serializes_publication_with_withdrawal', async () => {
    const org = await draft()
    await transition('organizations', org.id)
    const activity = await create('activities', {
      title: `Synthetic race ${randomUUID()}`,
      organization: org.id,
      eventDate: '2026-10-23',
    })
    const req = await createLocalReq({ user: actor() }, payload)
    await initTransaction(req)
    const version = await latestPublicationVersion(req, 'activities', activity.id)
    await transitionDomainRecord(req, {
      collection: 'activities',
      documentID: activity.id,
      action: 'publish',
      expected: { versionID: version.id, versionHash: version.hash },
    })
    const withdrawal = transition('organizations', org.id, 'withdraw')
    let waiting = false
    try {
      await expect
        .poll(async () => {
          waiting =
            (
              await payload.db.pool.query(
                "select 1 from pg_stat_activity where datname=current_database() and wait_event='advisory' and pid<>pg_backend_pid()",
              )
            ).rowCount! > 0
          return waiting
        })
        .toBe(true)
      await payload.db.commitTransaction(await req.transactionID!)
      req.transactionID = undefined
      await expect(withdrawal).rejects.toMatchObject({ status: 409 })
    } finally {
      await killTransaction(req)
      await withdrawal.catch(() => undefined)
    }
    expect(waiting).toBe(true)
    expect(
      await payload.findByID({ collection: 'activities', id: activity.id, overrideAccess: false }),
    ).toHaveProperty('_status', 'published')
  })
  it('ends_csg_participation_without_hiding_history_and_denies_new_publication_or_restore', async () => {
    const org = await draft({ kind: 'csg', participating: true })
    await transition('organizations', org.id)
    const activity = await create('activities', {
      title: `Synthetic CSG ${randomUUID()}`,
      organization: org.id,
      eventDate: '2026-10-23',
    })
    await transition('activities', activity.id)
    const req = await createLocalReq({ user: actor() }, payload)
    const historical = await latestPublicationVersion(req, 'activities', activity.id)
    await payload.update({
      collection: 'organizations',
      id: org.id,
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      data: { participating: false },
    })
    await transition('organizations', org.id)
    expect(
      await payload.findByID({ collection: 'activities', id: activity.id, overrideAccess: false }),
    ).toHaveProperty('_status', 'published')
    const next = await create('activities', {
      title: `Synthetic CSG new ${randomUUID()}`,
      organization: org.id,
      eventDate: '2026-10-24',
    })
    await expect(transition('activities', next.id)).rejects.toMatchObject({
      status: 400,
      data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'organization' })]) },
    })
    const current = await latestPublicationVersion(req, 'activities', activity.id)
    await expect(
      transitionDomainRecord(req, {
        collection: 'activities',
        documentID: activity.id,
        action: 'restore',
        expected: { versionID: current.id, versionHash: current.hash },
        restore: { versionID: historical.id, versionHash: historical.hash },
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
  it('publishes_and_restores_shared_people_with_active_and_inactive_csg_office_terms', async () => {
    const inactive = await draft({ kind: 'csg', participating: true })
    const active = await draft({ kind: 'csg', participating: true })
    const offices = []
    for (const organization of [inactive, active]) {
      await transition('organizations', organization.id)
      const office = await create('offices', {
        name: `Synthetic shared term ${randomUUID()}`,
        organization: organization.id,
      })
      await transition('offices', office.id)
      offices.push(office.id)
    }
    await payload.update({
      collection: 'organizations',
      id: inactive.id,
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      data: { participating: false },
    })
    await transition('organizations', inactive.id)
    const name = `Synthetic shared person ${randomUUID()}`
    const person = await create('people', {
      name,
      terms: offices.map((office) => ({ office })),
    })
    await transition('people', person.id)
    expect(
      await payload.findByID({ collection: 'people', id: person.id, overrideAccess: false }),
    ).toMatchObject({ name, _status: 'published' })
    const req = await createLocalReq({ user: actor() }, payload)
    const historical = await latestPublicationVersion(req, 'people', person.id)
    await payload.update({
      collection: 'people',
      id: person.id,
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      data: { name: `${name} corrected` },
    })
    await transition('people', person.id)
    expect(
      await payload.findByID({ collection: 'people', id: person.id, overrideAccess: false }),
    ).toMatchObject({ name: `${name} corrected`, _status: 'published' })
    const current = await latestPublicationVersion(req, 'people', person.id)
    await transitionDomainRecord(req, {
      collection: 'people',
      documentID: person.id,
      action: 'restore',
      expected: { versionID: current.id, versionHash: current.hash },
      restore: { versionID: historical.id, versionHash: historical.hash },
    })
    const published = await payload.findByID({
      collection: 'people',
      id: person.id,
      overrideAccess: false,
      depth: 0,
    })
    expect(published).toMatchObject({ name, _status: 'published' })
    expect(published.terms?.map(({ office }) => office)).toEqual(offices)
  })
  it('rechecks_office_organization_against_canonical_even_after_a_newer_unreferenced_draft', async () => {
    const first = await draft()
    const second = await draft()
    await transition('organizations', first.id)
    await transition('organizations', second.id)
    const office = await create('offices', {
      name: `Synthetic office ${randomUUID()}`,
      organization: first.id,
    })
    await transition('offices', office.id)
    await payload.update({
      collection: 'offices',
      id: office.id,
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      data: { organization: second.id },
    })
    await create('people', {
      name: 'Synthetic retained office reference',
      terms: [{ office: office.id }],
    })
    await expect(
      payload.update({
        collection: 'offices',
        id: office.id,
        draft: true,
        user: actor('editor'),
        overrideAccess: false,
        data: { name: 'Synthetic ordinary name edit' },
      }),
    ).resolves.toHaveProperty('id', office.id)
    await expect(transition('offices', office.id)).rejects.toMatchObject({ status: 409 })
  })
  it('rejects_a_newer_draft_as_replay_even_when_native_timestamps_tie', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T02:00:00Z'))
    try {
      const doc = await draft()
      await transition('organizations', doc.id)
      const head = await review(doc.id)
      const input = { action: 'withdraw', expected: head.expected }
      expect((await request(`/${doc.id}/transition`, 'publisher', input)).status).toBe(200)
      expect((await request(`/${doc.id}/transition`, 'publisher', input)).status).toBe(200)
      await payload.update({
        collection: 'organizations',
        id: doc.id,
        draft: true,
        user: actor('editor'),
        overrideAccess: false,
        data: { name: doc.name },
      })
      expect((await request(`/${doc.id}/transition`, 'publisher', input)).status).toBe(409)
    } finally {
      vi.useRealTimers()
    }
  })
  it('rejects_malformed_or_oversized_ids_proofs_and_native_flag_forgery_before_sql', async () => {
    const doc = await draft()
    const reviewed = await review(doc.id)
    const req = await createLocalReq({ user: actor() }, payload)
    const input = {
      collection: 'organizations' as const,
      documentID: doc.id,
      action: 'publish' as const,
      expected: reviewed.expected,
    }
    for (const documentID of [
      0,
      -1,
      true,
      '1',
      1.5,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      await expect(
        transitionDomainRecord(req, { ...input, documentID } as typeof input),
      ).rejects.toMatchObject({ status: 400 })
    for (const expected of [
      null,
      {},
      { versionID: '1', versionHash: '0'.repeat(64) },
      { versionID: Number.MAX_SAFE_INTEGER, versionHash: '0'.repeat(64) },
      { versionID: 1, versionHash: 'forged' },
    ])
      expect(
        (await request(`/${doc.id}/transition`, 'publisher', { action: 'publish', expected }))
          .status,
      ).toBe(400)
    for (const path of ['/9007199254740991/review', `/${doc.id}/review?versionID=9007199254740991`])
      expect((await request(path, 'publisher')).status).toBe(400)
    for (const value of ['9007199254740991', '1.5', '0'])
      await expect(
        authorizeScheduling({
          req,
          importMap: {},
          permissions: {},
          cookies: new Map(),
          doc: { relationTo: 'organizations', value },
          type: 'publish',
          date: new Date(Date.now() + 60000),
          expected: reviewed.expected,
        }),
      ).rejects.toMatchObject({ status: 400 })
    const version = reviewed.expected.versionID
    for (const overrideAccess of [false, true])
      await expect(
        payload.restoreVersion({
          collection: 'organizations',
          id: version,
          draft: true,
          overrideAccess,
          user: actor('super_admin'),
          context: { domainTransition: true, isRestoringVersion: true },
        }),
      ).rejects.toMatchObject({ status: 403 })
    for (const data of [
      { publishedAt: '2026-01-01' },
      { lastTransition: { actorID: fixtures.users.publisher.id } },
    ])
      await expect(
        payload.update({
          collection: 'organizations',
          id: doc.id,
          draft: true,
          overrideAccess: true,
          user: actor('super_admin'),
          data,
        }),
      ).rejects.toMatchObject({ status: 403 })
  })
  it('reloads_current_authority_for_saved_local_identity_and_exact_replay', async () => {
    const doc = await draft()
    const reviewed = await review(doc.id)
    const req = await createLocalReq({ user: actor() }, payload)
    const input = {
      collection: 'organizations' as const,
      documentID: doc.id,
      action: 'publish' as const,
      expected: reviewed.expected,
    }
    await transitionDomainRecord(req, input)
    await payload.update({
      collection: 'users',
      id: fixtures.users.publisher.id,
      overrideAccess: false,
      user: actor('super_admin'),
      data: { role: 'editor' },
    })
    try {
      await expect(transitionDomainRecord(req, input)).rejects.toMatchObject({ status: 403 })
    } finally {
      await payload.update({
        collection: 'users',
        id: fixtures.users.publisher.id,
        overrideAccess: false,
        user: actor('super_admin'),
        data: { role: 'publisher' },
      })
    }
    const session = await payload.login({
      collection: 'users',
      data: { email: fixtures.users.publisher.email, password: 'synthetic-access-password' },
    })
    fixtures.tokens.publisher = session.token!
  })
  it('keeps_native_generated_draft_slugs_unique_after_checkbox_generation', async () => {
    const first = await draft()
    const second = await draft()
    await expect(
      payload.update({
        collection: 'organizations',
        id: second.id,
        draft: true,
        overrideAccess: false,
        user: actor('editor'),
        data: { name: first.name, generateSlug: true },
      }),
    ).rejects.toMatchObject({
      status: 400,
      data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'slug' })]) },
    })
  })
  it('binds_historical_proofs_to_the_selected_document_and_keeps_official_transitions_sealed', async () => {
    const first = await draft()
    const other = await draft()
    const target = await review(other.id)
    expect(
      (await request(`/${first.id}/review?versionID=${target.expected.versionID}`, 'publisher'))
        .status,
    ).toBe(409)
    const current = await review(first.id)
    expect(
      (
        await request(`/${first.id}/transition`, 'publisher', {
          action: 'restore',
          expected: current.expected,
          restore: target.expected,
        })
      ).status,
    ).toBe(409)
    await transition('organizations', first.id)
    const file = await payload.db.create({
      collection: 'documents',
      data: { organization: first.id, title: 'Synthetic sealed file', state: 'pending' },
    })
    related.push({ collection: 'documents', id: file.id })
    for (const collection of ['issuances', 'reports'] as const) {
      const record = await create(collection, {
        title: `Synthetic official ${randomUUID()}`,
        organization: first.id,
        type: collection === 'issuances' ? 'advisory' : 'financial',
        reportingPeriod: 'Synthetic source period',
        mainDocument: file.id,
      })
      const req = await createLocalReq({ user: actor() }, payload)
      const version = await latestPublicationVersion(req, collection, record.id)
      const expected = { versionID: version.id, versionHash: version.hash }
      for (const action of ['publish', 'restore'] as const)
        await expect(
          transitionDomainRecord(req, {
            collection,
            documentID: record.id,
            action,
            expected,
            ...(action === 'restore' ? { restore: expected } : {}),
          }),
        ).rejects.toMatchObject({
          status: 400,
          data: {
            errors: expect.arrayContaining([
              expect.objectContaining({
                path: 'mainDocument',
                message: 'Upload and verify this document in private storage first.',
              }),
            ]),
          },
        })
      expect(
        await payload.findByID({
          collection,
          id: record.id,
          overrideAccess: false,
          disableErrors: true,
        }),
      ).toBeNull()
    }
  })
  it('keeps_canonical_slug_when_native_latest_flags_include_a_prepublication_draft', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T03:00:00Z'))
    try {
      const doc = await draft()
      await transition('organizations', doc.id)
      const versions = await payload.findVersions({
        collection: 'organizations',
        where: { parent: { equals: doc.id } },
      })
      expect(versions.docs.every(({ latest }) => latest)).toBe(true)
      for (const data of [
        { slug: `synthetic-forbidden-${randomUUID()}` },
        { slug: null },
        { slug: '' },
        { slug: '   ' },
        { name: 'Synthetic native tied generation', generateSlug: true },
      ])
        await expect(
          payload.update({
            collection: 'organizations',
            id: doc.id,
            draft: true,
            overrideAccess: false,
            user: actor('editor'),
            data: data as Record<string, unknown>,
          }),
        ).rejects.toMatchObject({
          status: 400,
          data: { errors: expect.arrayContaining([expect.objectContaining({ path: 'slug' })]) },
        })
    } finally {
      vi.useRealTimers()
    }
  })
  it('retains_canonical_first_publication_and_audit_on_a_tied_native_name_only_resave', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T04:00:00Z'))
    try {
      const doc = await draft()
      await transition('organizations', doc.id)
      const canonical = await payload.findByID({ collection: 'organizations', id: doc.id })
      const saved = await payload.update({
        collection: 'organizations',
        id: doc.id,
        draft: true,
        overrideAccess: false,
        user: actor('editor'),
        data: { name: 'Synthetic tied name-only draft' },
      })
      expect(saved.publishedAt).toBe(canonical.publishedAt)
      expect(saved.lastTransition).toEqual(canonical.lastTransition)
    } finally {
      vi.useRealTimers()
    }
  })
  it('withdraws_using_the_canonical_source_proof_after_its_native_version_is_pruned', async () => {
    const doc = await draft()
    const source = await review(doc.id)
    await transition('organizations', doc.id)
    for (let index = 0; index < 51; index++)
      await payload.update({
        collection: 'organizations',
        id: doc.id,
        draft: true,
        user: actor('editor'),
        overrideAccess: false,
        data: { name: `Synthetic retained published source ${index}` },
      })
    expect(
      (
        await payload.findVersions({
          collection: 'organizations',
          where: { id: { equals: source.expected.versionID } },
        })
      ).docs,
    ).toHaveLength(0)
    const head = await review(doc.id)
    const input = { action: 'withdraw', expected: head.expected }
    expect((await request(`/${doc.id}/transition`, 'publisher', input)).status).toBe(200)
    const saved = await payload.findByID({ collection: 'organizations', id: doc.id })
    expect(saved.name).toBe(doc.name)
    expect(saved.lastTransition).toMatchObject({
      reviewedVersionID: source.expected.versionID,
      reviewedVersionHash: source.expected.versionHash,
      expectedVersionID: head.expected.versionID,
      expectedVersionHash: head.expected.versionHash,
    })
    expect(
      await (await request(`/${doc.id}/transition`, 'publisher', input)).json(),
    ).toHaveProperty('alreadyApplied', true)
  }, 20000)
  it('returns_confirmed_domain_admin_schedule_outcomes_with_visible_conflict_details', async () => {
    expect(scheduling).toHaveProperty('schedulePublishFromAdmin', expect.any(Function))
    const adapter = Reflect.get(scheduling, 'schedulePublishFromAdmin')
    const doc = await draft()
    const reviewed = await review(doc.id)
    const req = await createLocalReq({ user: actor() }, payload)
    const args = {
      req,
      importMap: {},
      permissions: {},
      cookies: new Map(),
      doc: { relationTo: 'organizations' as const, value: String(doc.id) },
      type: 'publish' as const,
      date: new Date(Date.now() + 60000),
    }
    expect(await adapter(args)).toMatchObject({ confirmed: false, status: 400 })
    expect(
      await adapter({ ...args, expected: { ...reviewed.expected, versionHash: '0'.repeat(64) } }),
    ).toMatchObject({
      confirmed: false,
      status: 409,
      errors: [
        expect.objectContaining({ message: expect.stringContaining('reviewed revision changed') }),
      ],
    })
  })
  it('does_not_confirm_a_schedule_after_the_native_queue_write_aborts_its_transaction', async () => {
    const doc = await draft()
    const reviewed = await review(doc.id)
    const req = await createLocalReq({ user: actor() }, payload)
    const create = payload.db.create.bind(payload.db)
    let aborted = false
    const failure = vi.spyOn(payload.db, 'create').mockImplementation(async (args) => {
      const result = await create(args)
      if (args.collection === 'payload-jobs') {
        aborted = true
        expect(args.req).toBe(req)
        await killTransaction(req)
      }
      return result
    })
    try {
      await expect(
        authorizeScheduling({
          req,
          importMap: {},
          permissions: {},
          cookies: new Map(),
          doc: { relationTo: 'organizations', value: String(doc.id) },
          type: 'publish',
          date: new Date(Date.now() + 60000),
          expected: reviewed.expected,
        }),
      ).rejects.toMatchObject({ status: 500 })
    } finally {
      failure.mockRestore()
    }
    expect(aborted).toBe(true)
    expect(
      (
        await payload.count({
          collection: 'payload-jobs',
          where: { 'input.doc.value': { equals: String(doc.id) } },
        })
      ).totalDocs,
    ).toBe(0)
  })
  it.each(['accountID', 'documentID', 'versionID'] as const)(
    'rejects_persisted_domain_job_%s_outside_the_native_int4_boundary',
    async (field) => {
      const doc = await draft()
      const reviewed = await review(doc.id)
      const req = await createLocalReq({ user: actor() }, payload)
      const input = {
        type: 'publish' as const,
        doc: { relationTo: 'organizations' as const, value: String(doc.id) },
        accountID: fixtures.users.publisher.id,
        collection: 'organizations' as const,
        documentID: doc.id,
        versionID: reviewed.expected.versionID,
        versionHash: reviewed.expected.versionHash,
        [field]: Number.MAX_SAFE_INTEGER,
      }
      const job = await payload.jobs.queue({ task: 'schedulePublish', input })
      const { scheduledPublication } = await import('@/jobs/authorizePublication')
      try {
        await expect(
          scheduledPublication({ job, req, input } as Parameters<typeof scheduledPublication>[0]),
        ).rejects.toMatchObject({ status: 403 })
      } finally {
        await payload.delete({ collection: 'payload-jobs', id: job.id })
      }
    },
  )
  it('keeps_audit_private_in_graphql_and_uses_published_snapshots_for_public_relationships', async () => {
    const org = await draft()
    await transition('organizations', org.id)
    const officeName = `Synthetic public office ${randomUUID()}`
    const office = await create('offices', { name: officeName, organization: org.id })
    await transition('offices', office.id)
    const person = await create('people', {
      name: 'Synthetic public office holder',
      terms: [{ office: office.id }],
    })
    await transition('people', person.id)
    await payload.update({
      collection: 'offices',
      id: office.id,
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      data: { name: 'Synthetic private office draft' },
    })
    const publicPerson = await payload.findByID({
      collection: 'people',
      id: person.id,
      depth: 3,
      overrideAccess: false,
    })
    expect(publicPerson.terms?.[0].office).toMatchObject({ name: officeName })
    expect(JSON.stringify(publicPerson)).not.toContain('Synthetic private office draft')
    const graphql = async (query: string, role?: UserRole) =>
      (
        await GRAPHQL_POST(config)(
          new Request('http://127.0.0.1:3003/api/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(role ? { Authorization: `JWT ${fixtures.tokens[role]}` } : {}),
            },
            body: JSON.stringify({ query }),
          }),
        )
      ).json()
    const publicResult = await graphql(
      `{ Organizations(where: { id: { equals: ${org.id} } }) { docs { id name lastTransition { actorID reviewedVersionHash } } } }`,
    )
    expect(publicResult.errors).toBeUndefined()
    expect(publicResult.data.Organizations.docs[0].lastTransition).toEqual({
      actorID: null,
      reviewedVersionHash: null,
    })
    const staffResult = await graphql(
      `{ Organizations(where: { id: { equals: ${org.id} } }) { docs { lastTransition { actorID reviewedVersionHash } } } }`,
      'publisher',
    )
    expect(staffResult.data.Organizations.docs[0].lastTransition).toMatchObject({
      actorID: fixtures.users.publisher.id,
      reviewedVersionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    const auditFilter = await request(
      `?where[lastTransition.actorID][equals]=${fixtures.users.publisher.id}`,
    )
    expect(auditFilter.status).toBe(400)
    expect(await auditFilter.text()).not.toContain(org.name!)
    const denied = await graphql(
      `mutation { updateOrganization(id: ${org.id}, draft: false, data: { _status: published }) { id } }`,
      'publisher',
    )
    expect(denied.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('draft') }),
      ]),
    )
  })
})
