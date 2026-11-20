import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { adminCopy } from '@/admin/copy'
import { loadStateCounts } from '@/admin/dashboard/queries'
import { domainCollections } from '@/collections/shared/domainCollections'
import { syntheticContent as content } from '../helpers/contentFixtures'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const context = { disableRevalidate: true }

describe('list state links', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const created: number[] = []
  const user = (role: 'editor' | 'publisher') => ({
    ...fixtures.users[role],
    collection: 'users' as const,
  })
  const reqFor = (role: 'editor' | 'publisher') => createLocalReq({ user: user(role) }, payload)
  const counts = async (role: 'editor' | 'publisher') => {
    const result = await loadStateCounts(await reqFor(role), 'posts')
    if (!result.ok) throw new Error(result.error)
    return result.counts
  }

  async function post(published: boolean) {
    const doc = await payload.create({
      collection: 'posts',
      user: user('publisher'),
      overrideAccess: false,
      draft: !published,
      context,
      data: {
        title: `State ${randomUUID().slice(0, 8)}`,
        slug: `synthetic-${randomUUID()}`,
        content,
        _status: published ? 'published' : 'draft',
      },
    })
    created.push(doc.id)
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    for (const id of created) await payload.delete({ collection: 'posts', id, context })
    await removeTestAccounts(
      payload,
      Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    )
  })

  it('adds the links above the list of every collection that keeps drafts', () => {
    for (const slug of ['pages', 'posts', ...domainCollections]) {
      const collection = payload.collections[slug as 'posts'].config
      expect(collection.admin.components?.beforeListTable, slug).toContain('@/admin/stateLinks')
    }
  })

  it('counts each record once, by its newest save, the way the list shows it', async () => {
    const before = await counts('editor')
    await post(false)
    await post(true)
    const after = await counts('editor')
    expect(after).toEqual({
      all: before.all + 2,
      draft: before.draft + 1,
      published: before.published + 1,
    })
    expect(after.all).toBe(after.draft + after.published)
  })

  it('reports a failed count as an error, never as zero', async () => {
    // Fail only the posts counts, so the account lookup passes and the count path is what fails.
    const original = payload.find.bind(payload)
    const spy = vi
      .spyOn(payload, 'find')
      .mockImplementation(((args: Parameters<Payload['find']>[0]) =>
        args.collection === 'posts'
          ? Promise.reject(new Error('synthetic failure'))
          : original(args)) as Payload['find'])
    const result = await loadStateCounts(await reqFor('editor'), 'posts')
    expect(spy.mock.calls.some(([args]) => args.collection === 'posts')).toBe(true)
    spy.mockRestore()
    expect(result).toEqual({ ok: false, error: adminCopy.loadError })
  })

  it('refuses to count without a signed-in staff member', async () => {
    const anonymous = await createLocalReq({}, payload)
    expect((await loadStateCounts(anonymous, 'posts')).ok).toBe(false)
  })
})
