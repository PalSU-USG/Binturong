import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { APIError, createLocalReq, getPayload, handleEndpoints, type Payload } from 'payload'

import type { UserRole } from '@/access/roles'
import type { DomainCollection } from '@/collections/shared/domainCollections'
import { transitionDomainRecord } from '@/collections/shared/transitionDomainRecord'
import { latestPublicationVersion } from '@/jobs/publicationRevision'
import config from '@/payload.config'
import { acquireDocumentDeliverySlot as acquireDocumentSlot } from '@/storage/documentLimits'
import * as officialStorage from '@/storage/officialStorage'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import { assertTestStorage } from '../helpers/assertTestStorage'
import {
  createDisposableAccount,
  disableAccount,
  removeObjects,
  seedFile,
  sha256Hex,
  syntheticPDF,
} from '../helpers/officialFileFixtures'

describe('controlled private document delivery', () => {
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

  const fresh = (user?: unknown) => createLocalReq(user ? { user: user as never } : {}, payload)
  async function run(collection: DomainCollection, id: number, action: 'publish' | 'withdraw') {
    const req = await fresh(actor())
    const version = await latestPublicationVersion(req, collection, id)
    return transitionDomainRecord(req, {
      collection,
      documentID: id,
      action,
      expected: { versionID: version.id, versionHash: version.hash },
    })
  }
  async function org() {
    const created = await payload.create({
      collection: 'organizations',
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data: { name: `Synthetic delivery org ${randomUUID()}`, kind: 'usg' },
    })
    orgs.push(created.id)
    await run('organizations', created.id, 'publish')
    return created.id
  }
  async function file(organization: number, options?: Parameters<typeof seedFile>[3]) {
    const seeded = await seedFile(payload, tracker, organization, options)
    related.push({ collection: 'documents', id: seeded.id })
    return seeded
  }
  async function record(organization: number, main: number, attachments: number[] = []) {
    const doc = await payload.create({
      collection: 'issuances',
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data: {
        title: `Synthetic delivery ${randomUUID()}`,
        organization,
        type: 'advisory',
        mainDocument: main,
        attachments,
      },
    } as never)
    related.push({ collection: 'issuances', id: doc.id })
    return doc.id as number
  }
  const edit = (id: number, data: Record<string, unknown>) =>
    payload.update({
      collection: 'issuances',
      id,
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data,
    } as never)
  const get = (id: number | string, role?: UserRole) =>
    handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api/documents/${id}/file`, {
        method: 'GET',
        headers: role ? { Authorization: `JWT ${fixtures.tokens[role]}` } : {},
      }),
    })

  const code = async (id: number | string, role?: UserRole) => {
    const response = await get(id, role)
    await response.body?.cancel()
    return response.status
  }

  it('streams_verified_bytes_to_staff_with_private_attachment_headers', async () => {
    const o = await org()
    const f = await file(o, { originalFilename: 'Résumé "x".pdf' })
    const response = await get(f.id, 'editor')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Length')).toBe(String(f.bytes.byteLength))
    const disposition = response.headers.get('Content-Disposition') ?? ''
    expect(disposition).toMatch(/^attachment; filename="[^"\\\r\n]*"; filename\*=UTF-8''/)
    const body = new Uint8Array(await response.arrayBuffer())
    expect(sha256Hex(body)).toBe(f.sha256)
    expect(JSON.stringify(Object.fromEntries(response.headers))).not.toContain(f.key)
  })

  it('denies_guessed_malformed_anonymous_and_unpublished_requests_identically', async () => {
    const o = await org()
    const private1 = await file(o)
    const draftRef = await file(o)
    await record(o, draftRef.id)
    const bodies = new Set<string>()
    for (const [id, role] of [
      ['abc', undefined],
      ['0', undefined],
      ['2147483648', undefined],
      [String(private1.id), undefined],
      [String(draftRef.id), undefined],
      ['2147483647', 'editor'],
    ] as const) {
      const response = await get(id, role)
      expect([400, 404]).toContain(response.status)
      expect(response.headers.get('Content-Type')).not.toBe('application/pdf')
      if (response.status === 404) bodies.add(await response.text())
    }
    expect(bodies.size).toBe(1)
    expect(await code(private1.id, 'editor')).toBe(200)
  })

  it('serves_only_current_published_references_to_the_public', async () => {
    const o = await org()
    const a = await file(o)
    const b = await file(o)
    const att = await file(o)
    const one = await record(o, a.id, [att.id])
    const two = await record(o, a.id)
    expect(await code(a.id)).toBe(404)
    await run('issuances', one, 'publish')
    expect(await code(a.id)).toBe(200)
    expect(await code(att.id)).toBe(200)
    // A newer draft replacement does not publish the replacement bytes.
    await edit(one, { mainDocument: b.id, attachments: [] })
    expect(await code(b.id)).toBe(404)
    expect(await code(a.id)).toBe(200)
    // Publish the replacement: the older file is now historical-only for that record.
    await run('issuances', one, 'publish')
    expect(await code(b.id)).toBe(200)
    expect(await code(att.id)).toBe(404)
    expect(await code(a.id)).toBe(404)
    // A shared reference stays public until its last published reference is withdrawn.
    await run('issuances', two, 'publish')
    expect(await code(a.id)).toBe(200)
    await run('issuances', two, 'withdraw')
    expect(await code(a.id)).toBe(404)
    await run('issuances', one, 'withdraw')
    expect(await code(b.id)).toBe(404)
    expect(await code(b.id, 'editor')).toBe(200)
  })

  it('rechecks_current_staff_authorization_and_denies_disabled_actors', async () => {
    const { downloadDocument } = await import('@/storage/documentDelivery')
    const o = await org()
    const f = await file(o)
    const account = await createDisposableAccount(payload, 'editor')
    extraAccounts.push(account.id)
    const user = { ...account.user, collection: 'users' as const }
    const ok = await downloadDocument(await fresh(user), f.id)
    expect(ok.status).toBe(200)
    await ok.body!.cancel()
    await disableAccount(payload, account.id)
    await expect(downloadDocument(await fresh(user), f.id)).rejects.toMatchObject({ status: 404 })

    // Revoked while the object is being read and verified: no bytes are released.
    const second = await createDisposableAccount(payload, 'editor')
    extraAccounts.push(second.id)
    const real = officialStorage.getOfficialStorage()
    vi.spyOn(officialStorage, 'getOfficialStorage').mockReturnValue({
      ...real,
      read: async (key: string) => {
        const bytes = await real.read(key)
        await disableAccount(payload, second.id)
        return bytes
      },
    })
    await expect(
      downloadDocument(await fresh({ ...second.user, collection: 'users' }), f.id),
    ).rejects.toMatchObject({ status: 404 })
    vi.restoreAllMocks()
    // The slot was released: two concurrent deliveries are still allowed.
    const held = [acquireDocumentSlot()]
    held.forEach((release) => release())
  })

  it('fails_closed_for_tampered_keys_corrupt_bytes_and_checksum_mismatch', async () => {
    const o = await org()
    const cases = [
      await file(o, { key: `pending/${randomUUID()}.pdf`, writeObject: false }),
      await file(o, { key: 'ready/../../etc.pdf', writeObject: false }),
      await file(o, { bytes: new TextEncoder().encode('%PDF-not really') }),
      await file(o, { metadataSha: sha256Hex(new Uint8Array([4])) }),
      await file(o, { writeObject: false }),
    ]
    for (const f of cases) {
      const response = await get(f.id, 'editor')
      expect([409, 502, 503]).toContain(response.status)
      expect(response.headers.get('Content-Type')).not.toBe('application/pdf')
      expect(response.headers.get('Content-Disposition')).toBeNull()
    }
    // Slots are all free afterwards.
    const held = [acquireDocumentSlot(), acquireDocumentSlot()]
    held.forEach((release) => release())
  })

  it('bounds_concurrent_deliveries_and_releases_slots_on_cancel_end_and_error', async () => {
    const { downloadDocument } = await import('@/storage/documentDelivery')
    const o = await org()
    const big = await file(o, { bytes: await syntheticPDF('Synthetic large', 6_500_000) })
    const req = () => fresh(actor('editor'))
    const first = await downloadDocument(await req(), big.id)
    const second = await downloadDocument(await req(), big.id)
    await expect(downloadDocument(await req(), big.id)).rejects.toMatchObject({ status: 503 })

    // Cancel releases.
    await first.body!.cancel()
    const third = await downloadDocument(await req(), big.id)
    // Read-to-end releases and the delivered bytes are exactly the verified bytes.
    expect(sha256Hex(new Uint8Array(await second.arrayBuffer()))).toBe(big.sha256)
    expect(sha256Hex(new Uint8Array(await third.arrayBuffer()))).toBe(big.sha256)
    const a = await downloadDocument(await req(), big.id)
    const b = await downloadDocument(await req(), big.id)
    await a.body!.cancel()
    await b.body!.cancel()

    // Provider error releases.
    const real = officialStorage.getOfficialStorage()
    vi.spyOn(officialStorage, 'getOfficialStorage').mockReturnValue({
      ...real,
      read: async () => {
        throw new APIError('Private document storage is unavailable. Try again later.', 503)
      },
    })
    for (let attempt = 0; attempt < 3; attempt++)
      await expect(downloadDocument(await req(), big.id)).rejects.toMatchObject({ status: 503 })
    vi.restoreAllMocks()
    const held = [acquireDocumentSlot(), acquireDocumentSlot()]
    held.forEach((release) => release())
  })
})
