import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, handleEndpoints, type Payload } from 'payload'
import { GRAPHQL_POST } from '@payloadcms/next/routes'

import config from '@/payload.config'
import type { UserRole } from '@/access/roles'
import type { Post } from '@/payload-types'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import { syntheticContent } from '../helpers/contentFixtures'
import { createRecordFixtures } from '../helpers/searchFixtures'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

const context = { disableRevalidate: true }

describe('search index follows publication', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  let records: ReturnType<typeof createRecordFixtures>
  const posts: Post[] = []
  const run = randomUUID()
  const actor = (role: UserRole) => ({ ...fixtures.users[role], collection: 'users' as const })

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
    records = createRecordFixtures(payload)
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    await records?.cleanup()
    for (const { id } of posts)
      await payload.delete({ collection: 'posts', where: { id: { equals: id } }, context })
    await removeTestAccounts(
      payload,
      Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    )
  })

  async function createPost(published = true, extra: Record<string, unknown> = {}) {
    const doc = await payload.create({
      collection: 'posts',
      data: {
        title: `Synthetic ${randomUUID()}`,
        slug: `synthetic-${randomUUID()}`,
        content: syntheticContent,
        _status: published ? 'published' : 'draft',
        ...extra,
      },
      draft: !published,
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    posts.push(doc)
    return doc
  }
  const rows = (relationTo: string, value: number) =>
    payload.find({
      collection: 'search',
      depth: 0,
      pagination: false,
      limit: 0,
      where: { 'doc.relationTo': { equals: relationTo }, 'doc.value': { equals: value } },
    })
  const api = (path: string, role?: UserRole, method = 'GET', body?: unknown) =>
    handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api/${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(role ? { Authorization: `JWT ${fixtures.tokens[role]}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
  const graphql = async () => {
    const response = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '{ Searches(limit:200) { docs { title identifier summary } } }',
        }),
      }),
    )
    const result = await response.json()
    expect(result.errors).toBeUndefined()
    return JSON.stringify(result.data)
  }
  const reindex = (collections: unknown) =>
    api('search/reindex', 'publisher', 'POST', { collections })

  it('creates_one_post_row_with_ordering_fields_and_keeps_published_text_over_a_draft', async () => {
    const post = await createPost()
    const [row] = (await rows('posts', post.id)).docs
    expect(row).toMatchObject({ title: post.title, slug: post.slug })
    expect(row.sortAt).toBeTruthy()
    expect(row.identifier ?? null).toBeNull()
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { title: 'Synthetic draft only title' },
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      context,
    })
    const after = await rows('posts', post.id)
    expect(after.docs).toHaveLength(1)
    expect(after.docs[0].title).toBe(post.title)
    expect(JSON.stringify(await (await api('search?limit=200')).json())).not.toContain(
      'Synthetic draft only title',
    )
  })

  it('refreshes_one_row_on_a_later_publish_and_removes_it_on_withdrawal', async () => {
    const post = await createPost()
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { title: 'Synthetic republished title', _status: 'published' },
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    const refreshed = await rows('posts', post.id)
    expect(refreshed.docs).toHaveLength(1)
    expect(refreshed.docs[0].title).toBe('Synthetic republished title')
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'draft' },
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    expect((await rows('posts', post.id)).docs).toHaveLength(0)
    expect(JSON.stringify(await (await api('search?limit=200')).json())).not.toContain(
      'Synthetic republished title',
    )
  })

  it('leaves_no_row_for_a_deleted_draft_only_post', async () => {
    const post = await createPost(false)
    expect((await rows('posts', post.id)).docs).toHaveLength(0)
    await payload.delete({ collection: 'posts', id: post.id, context })
    expect((await rows('posts', post.id)).docs).toHaveLength(0)
  })

  it('recreates_the_row_when_a_published_version_is_restored', async () => {
    const post = await createPost()
    const { docs: versions } = await payload.findVersions({
      collection: 'posts',
      where: { parent: { equals: post.id } },
    })
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'draft' },
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    expect((await rows('posts', post.id)).docs).toHaveLength(0)
    await payload.restoreVersion({
      collection: 'posts',
      id: versions[0].id,
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    const restored = await payload.findByID({ collection: 'posts', id: post.id, draft: false })
    const after = await rows('posts', post.id)
    expect(after.docs).toHaveLength(restored._status === 'published' ? 1 : 0)
  })

  it('indexes_issuances_and_reports_without_documents_or_private_fields', async () => {
    const issuance = await records.issuance({
      title: 'Synthetic search issuance',
      identifier: 'Res. No. 2026-014',
      summary: 'Synthetic issuance summary text',
    })
    const report = await records.report({
      title: 'Synthetic search report',
      identifier: 'Synthetic Q1 period',
      summary: 'x'.repeat(400),
    })
    expect((await reindex(['issuances', 'reports'])).status).toBe(200)
    const [i] = (await rows('issuances', issuance.id)).docs
    const [r] = (await rows('reports', report.id)).docs
    expect(i).toMatchObject({
      title: 'Synthetic search issuance',
      slug: issuance.slug,
      identifier: 'Res. No. 2026-014',
      identifierKey: 'resno2026014',
      summary: 'Synthetic issuance summary text',
    })
    expect(r).toMatchObject({ identifier: 'Synthetic Q1 period' })
    expect(r.summary).toHaveLength(300)
    for (const row of [i, r]) {
      expect(i.sortAt).toBeTruthy()
      const serialized = JSON.stringify(row)
      for (const forbidden of [
        'mainDocument',
        'attachments',
        'storageKey',
        'originalFilename',
        'sha256',
        'lastTransition',
        'Synthetic sealed file',
      ])
        expect(serialized).not.toContain(forbidden)
    }
  })

  it('hides_a_stale_row_whose_source_is_no_longer_published_in_rest_and_graphql', async () => {
    const issuance = await records.issuance({
      title: `Synthetic stale issuance title ${run}`,
      identifier: 'Stale-1',
      summary: `Synthetic stale summary ${run}`,
    })
    expect((await reindex(['issuances'])).status).toBe(200)
    expect(JSON.stringify(await (await api('search?limit=200')).json())).toContain(
      `Synthetic stale issuance title ${run}`,
    )
    expect(await graphql()).toContain(`Synthetic stale issuance title ${run}`)
    await payload.db.updateOne({
      collection: 'issuances',
      where: { id: { equals: issuance.id } },
      data: { _status: 'draft' },
    })
    expect((await rows('issuances', issuance.id)).docs).toHaveLength(1)
    const rest = JSON.stringify(await (await api('search?limit=200')).json())
    expect(rest).not.toContain(`Synthetic stale issuance title ${run}`)
    expect(await graphql()).not.toContain(`Synthetic stale issuance title ${run}`)
    expect(rest).not.toContain(`Synthetic stale summary ${run}`)
    expect(await graphql()).not.toContain('Stale-1')
    const withDepth = await api('search?limit=200&depth=2')
    expect(JSON.stringify(await withDepth.json())).not.toContain(
      `Synthetic stale issuance title ${run}`,
    )
  })

  it('does_not_apply_one_collections_published_ids_to_another_collection', async () => {
    const issuance = await records.issuance({
      title: `Synthetic collision issuance ${run}`,
      identifier: 'C-1',
    })
    expect((await reindex(['issuances'])).status).toBe(200)
    await payload.db.updateOne({
      collection: 'issuances',
      where: { id: { equals: issuance.id } },
      data: { _status: 'draft' },
    })
    // A published post that happens to share the issuance id must not reveal the stale issuance row.
    const rowsBefore = await rows('issuances', issuance.id)
    expect(rowsBefore.docs).toHaveLength(1)
    const publicRows = await payload.find({
      collection: 'search',
      overrideAccess: false,
      depth: 0,
      pagination: false,
      limit: 0,
      where: { 'doc.relationTo': { equals: 'issuances' } },
    })
    expect(publicRows.docs.some((row) => row.title === `Synthetic collision issuance ${run}`)).toBe(
      false,
    )
  })

  it('returns_an_empty_list_for_anonymous_reads_when_a_collection_has_nothing_published', async () => {
    const response = await api('search?limit=5&where[title][equals]=__nothing__')
    expect(response.status).toBe(200)
    expect((await response.json()).docs).toEqual([])
  })

  it('rejects_unknown_empty_and_duplicate_reindex_collections', async () => {
    for (const collections of [
      null,
      'posts',
      [],
      ['documents'],
      ['posts', 'posts'],
      ['posts', 'users'],
    ])
      expect((await reindex(collections)).status, JSON.stringify(collections)).toBe(400)
  })

  it('reindexes_only_the_requested_collections_and_converges_on_every_field', async () => {
    const post = await createPost()
    const issuance = await records.issuance({
      title: 'Synthetic converge issuance',
      identifier: 'Conv. 7',
      summary: 'Converge summary',
    })
    await payload.update({
      collection: 'search',
      where: { 'doc.value': { equals: post.id }, 'doc.relationTo': { equals: 'posts' } },
      data: { title: 'Synthetic tampered' },
      context: { reindex: true },
    })
    expect((await reindex(['issuances'])).status).toBe(200)
    expect((await rows('posts', post.id)).docs[0].title).toBe('Synthetic tampered')
    expect((await rows('issuances', issuance.id)).docs).toHaveLength(1)
    expect((await reindex(['posts', 'issuances'])).status).toBe(200)
    expect((await rows('posts', post.id)).docs[0].title).toBe(post.title)
    expect((await rows('issuances', issuance.id)).docs[0]).toMatchObject({
      identifier: 'Conv. 7',
      summary: 'Converge summary',
    })
  })

  it('rolls_back_a_failed_multi_collection_reindex_leaving_the_previous_index_intact', async () => {
    await createPost()
    await records.report({ title: 'Synthetic rollback report', identifier: 'RB-1' })
    expect((await reindex(['posts', 'reports'])).status).toBe(200)
    const before = await payload.find({
      collection: 'search',
      depth: 0,
      pagination: false,
      limit: 0,
    })
    const create = payload.create.bind(payload)
    let calls = 0
    const failure = vi.spyOn(payload, 'create').mockImplementation(async (options) => {
      if (options.collection === 'search' && ++calls > 1)
        throw new Error('Synthetic indexing outage')
      return create(options)
    })
    try {
      expect((await reindex(['posts', 'reports'])).status).toBe(500)
    } finally {
      failure.mockRestore()
    }
    const after = await payload.find({
      collection: 'search',
      depth: 0,
      pagination: false,
      limit: 0,
    })
    expect(after.docs).toEqual(before.docs)
  })
})
