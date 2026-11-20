import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload } from 'payload'

import { renderToStaticMarkup } from 'react-dom/server'

import config from '@/payload.config'
import AdminHome from '@/admin/dashboard'
import { loadDrafts, loadRecentChanges } from '@/admin/dashboard/queries'
import { syntheticContent as content } from '../helpers/contentFixtures'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const context = { disableRevalidate: true }

describe('dashboard queries', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const created: { collection: 'posts' | 'people' | 'issuances'; id: number }[] = []
  const tag = randomUUID().slice(0, 8)
  const user = (role: 'editor' | 'publisher') => ({
    ...fixtures.users[role],
    collection: 'users' as const,
  })
  const reqFor = (role: 'editor' | 'publisher') => createLocalReq({ user: user(role) }, payload)

  async function post(role: 'editor' | 'publisher', title: string, published = false) {
    const doc = await payload.create({
      collection: 'posts',
      user: user(role),
      overrideAccess: false,
      draft: !published,
      context,
      data: {
        title: `${title} ${tag}`,
        slug: `synthetic-${randomUUID()}`,
        content,
        _status: published ? 'published' : 'draft',
      },
    })
    created.push({ collection: 'posts', id: doc.id })
    return doc
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    for (const record of created) {
      // Domain records are only deletable through the guarded draft path; remove below it.
      if (record.collection !== 'posts') {
        await payload.db.deleteVersions({
          collection: record.collection,
          where: { parent: { equals: record.id } },
        })
        await payload.db.deleteOne({
          collection: record.collection,
          where: { id: { equals: record.id } },
        })
      } else if (await payload.findByID({ ...record, disableErrors: true }))
        await payload.delete({ ...record, context })
    }
    await removeTestAccounts(
      payload,
      Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    )
  })

  it('lists only my own unpublished drafts, with a minimal shape', async () => {
    const mine = await post('editor', 'Mine')
    const theirs = await post('publisher', 'Theirs')
    const live = await post('publisher', 'Live', true)
    const result = await loadDrafts(await reqFor('editor'), { mine: true })
    if (!result.ok) throw new Error(result.error)
    const ids = result.items.map((item) => `${item.collection}:${item.id}`)
    expect(ids).toContain(`posts:${mine.id}`)
    expect(ids).not.toContain(`posts:${theirs.id}`)
    expect(ids).not.toContain(`posts:${live.id}`)
    const item = result.items.find((entry) => entry.id === mine.id)!
    expect(Object.keys(item).sort()).toEqual([
      'collection',
      'href',
      'id',
      'title',
      'type',
      'updatedAt',
    ])
    expect(item.title).toBe(`Mine ${tag}`)
    expect(item.href).toBe(`/admin/collections/posts/${mine.id}`)
  })

  it('shows publishers the oldest waiting drafts first and never more than five', async () => {
    for (let index = 0; index < 6; index++) await post('editor', `Queue ${index}`)
    const person = await payload.create({
      collection: 'people',
      user: user('editor'),
      overrideAccess: false,
      draft: true,
      data: { name: `Queue person ${tag}` },
    })
    created.push({ collection: 'people', id: person.id })
    const result = await loadDrafts(await reqFor('publisher'), { oldestFirst: true })
    if (!result.ok) throw new Error(result.error)
    expect(result.items.length).toBeLessThanOrEqual(5)
    for (const item of result.items) {
      expect(item.id, JSON.stringify(item)).toBeTruthy()
      expect(item.href).not.toContain('null')
    }
    const times = result.items.map((item) => Date.parse(item.updatedAt))
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('reports a failed query as an error, never as an empty list', async () => {
    const spy = vi.spyOn(payload, 'find').mockRejectedValueOnce(new Error('synthetic failure'))
    const result = await loadDrafts(await reqFor('editor'), { mine: true })
    spy.mockRestore()
    expect(result.ok).toBe(false)
  })

  it('refuses to run without a signed-in staff member', async () => {
    const anonymous = await createLocalReq({}, payload)
    expect((await loadDrafts(anonymous, { mine: true })).ok).toBe(false)
    expect((await loadRecentChanges(anonymous)).ok).toBe(false)
  })

  it('lists recently published items with the action and time', async () => {
    const live = await post('publisher', 'Recent', true)
    const result = await loadRecentChanges(await reqFor('editor'))
    if (!result.ok) throw new Error(result.error)
    const item = result.items.find((entry) => entry.id === live.id)
    expect(item).toMatchObject({ collection: 'posts', action: 'Published' })
    expect(item && 'actor' in item).toBe(false)
  })

  it('ignores orphan draft versions in the database query before applying the limit', async () => {
    const mine = await post('editor', 'Survived orphans')
    const orphanIDs: (number | string)[] = []
    try {
      for (let i = 0; i < 6; i++) {
        const orphan = await payload.db.createVersion({
          collectionSlug: 'posts',
          parent: null as never,
          autosave: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date(Date.now() + (i + 1) * 1000).toISOString(),
          versionData: {
            title: `Orphan ${i}`,
            _status: 'draft',
            lastEditedBy: fixtures.users.editor.id,
          } as never,
        })
        orphanIDs.push(orphan.id)
      }
      const result = await loadDrafts(await reqFor('editor'), { mine: true })
      if (!result.ok) throw new Error(result.error)
      expect(result.items.map((item) => item.id)).toContain(mine.id)
    } finally {
      if (orphanIDs.length)
        await payload.db.deleteVersions({
          collection: 'posts',
          where: { id: { in: orphanIDs } },
        })
    }
  })

  async function issuance(type: 'resolution' | 'memorandum', title: string) {
    const doc = await payload.create({
      collection: 'issuances',
      user: user('editor'),
      overrideAccess: false,
      draft: true,
      data: { title: `${title} ${tag}`, type } as never,
    })
    created.push({ collection: 'issuances', id: doc.id })
    return doc
  }

  it('labels_each_draft_with_its_type', async () => {
    const notice = await post('editor', 'Typed post')
    const resolution = await issuance('resolution', 'Typed resolution')
    const memo = await issuance('memorandum', 'Typed memo')
    const result = await loadDrafts(await reqFor('editor'), { mine: true })
    if (!result.ok) throw new Error(result.error)
    const typeOf = (id: number) => result.items.find((item) => item.id === id)?.type
    expect(typeOf(memo.id)).toBe('Memorandum')
    expect(typeOf(resolution.id)).toBe('Resolution')
    expect(typeOf(notice.id)).toBe('Post')
  })

  it('labels_recent_changes_with_their_type', async () => {
    const live = await post('publisher', 'Typed recent', true)
    const result = await loadRecentChanges(await reqFor('editor'))
    if (!result.ok) throw new Error(result.error)
    expect(result.items.find((item) => item.id === live.id)?.type).toBe('Post')
  })

  it('renders_each_home_row_with_type_age_and_one_action_button', async () => {
    const draft = await issuance('resolution', 'Rendered resolution')
    const render = async (role: 'editor' | 'publisher') =>
      renderToStaticMarkup(
        await AdminHome({
          initPageResult: { req: await reqFor(role), permissions: {} },
        } as never),
      )
    const section = (html: string, id: string) =>
      html.match(new RegExp(`id="${id}-section".*?</section>`, 's'))?.[0] ?? ''
    const rows = (html: string) => html.match(/<li>.*?<\/li>/gs) ?? []

    const mine = rows(section(await render('editor'), 'your-drafts')).find((row) =>
      row.includes(draft.title),
    )
    expect(mine).toBeDefined()
    expect(mine).toContain('Resolution. Saved ')
    const mineLinks = mine!.match(/<a [^>]*>(.*?)<\/a>/gs) ?? []
    expect(mineLinks).toHaveLength(1)
    expect(mineLinks[0]).toMatch(/^<a [^>]*>Continue/)
    expect(mineLinks[0]).toContain(draft.title)

    const waiting = rows(section(await render('publisher'), 'waiting'))
    expect(waiting.length).toBeGreaterThan(0)
    for (const row of waiting) {
      const links = row.match(/<a [^>]*>(.*?)<\/a>/gs) ?? []
      expect(links).toHaveLength(1)
      expect(links[0]).toMatch(/^<a [^>]*>Open and review/)
    }
  })
})
