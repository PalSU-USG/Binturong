import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, handleEndpoints, type Payload } from 'payload'
import { randomUUID } from 'node:crypto'

import config from '@/payload.config'
import type { Post } from '@/payload-types'
import { runSearch } from '@/search/query'
import { searchTargets } from '@/search/searchTargets'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import { syntheticContent } from '../helpers/contentFixtures'
import { createRecordFixtures } from '../helpers/searchFixtures'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
const context = { disableRevalidate: true }
const DAY = 86_400_000

describe('public search query', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  let records: ReturnType<typeof createRecordFixtures>
  const posts: Post[] = []
  const tag = randomUUID().replaceAll('-', '').slice(0, 10)
  const search = (
    q: string,
    type: 'all' | 'updates' | 'issuances' | 'reports' = 'all',
    page = 1,
    now?: Date,
  ) => runSearch(payload, { q, type, page }, now)

  async function post(title: string, extra: Record<string, unknown> = {}, published = true) {
    const doc = await payload.create({
      collection: 'posts',
      data: {
        title,
        slug: `synthetic-${randomUUID()}`,
        content: syntheticContent,
        _status: published ? 'published' : 'draft',
        ...extra,
      },
      draft: !published,
      user: { ...fixtures.users.publisher, collection: 'users' },
      overrideAccess: false,
      context,
    })
    posts.push(doc)
    return doc
  }

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

  it('matches_title_slug_description_and_multiple_words_with_and_semantics', async () => {
    const a = await post(`Alpha${tag} budget hearing`, {
      meta: { description: `Zeta${tag} notes` },
    })
    await post(`Alpha${tag} only`)
    expect((await search(`alpha${tag}`)).totalDocs).toBe(2)
    expect((await search(`ALPHA${tag} budget`)).hits.map((h) => h.title)).toEqual([a.title])
    expect((await search(`budget alpha${tag}`)).totalDocs).toBe(1)
    expect((await search(`zeta${tag}`)).totalDocs).toBe(1)
    expect((await search(`${a.slug}`.toUpperCase())).totalDocs).toBe(1)
    expect((await search(`alpha${tag} missingword`)).totalDocs).toBe(0)
  })

  it('does_not_let_wildcard_characters_widen_results', async () => {
    await post(`Wild${tag} one`)
    // parseSearchParams strips these; the query layer must still treat any that remain literally.
    expect((await search(`nomatch${tag}`)).totalDocs).toBe(0)
    expect((await search('%')).totalDocs).toBe(0)
    expect((await search('_')).totalDocs).toBe(0)
  })

  it('filters_by_type_and_never_lists_non_live_collections', async () => {
    await post(`Typed${tag} update`)
    await records.issuance({ title: `Typed${tag} issuance`, identifier: `ZZ-${tag}` })
    await records.report({ title: `Typed${tag} report`, identifier: `RR-${tag}` })
    const reindexed = await handleEndpoints({
      config,
      request: new Request('http://127.0.0.1:3003/api/search/reindex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.publisher}`,
        },
        body: JSON.stringify({ collections: ['posts', 'issuances', 'reports'] }),
      }),
    })
    expect(reindexed.status).toBe(200)
    const all = await search(`typed${tag}`)
    expect(all.hits.map((h) => h.label)).toEqual(['Update'])
    expect((await search(`typed${tag}`, 'updates')).totalDocs).toBe(1)
    expect((await search(`typed${tag}`, 'issuances')).hits).toEqual([])
    expect((await search(`typed${tag}`, 'reports')).hits).toEqual([])
    expect((await search(`zz-${tag}`)).hits).toEqual([])
  })

  it('omits_draft_only_and_withdrawn_posts', async () => {
    await post(`Hidden${tag} draft`, {}, false)
    const gone = await post(`Hidden${tag} withdrawn`)
    await payload.update({
      collection: 'posts',
      id: gone.id,
      data: { _status: 'draft' },
      user: { ...fixtures.users.publisher, collection: 'users' },
      overrideAccess: false,
      context,
    })
    expect((await search(`hidden${tag}`)).totalDocs).toBe(0)
  })

  it('links_posts_to_their_canonical_page_and_never_to_api_or_documents', async () => {
    const doc = await post(`Link${tag} sample`, { slug: `link-${tag}` })
    const { hits } = await search(`link${tag}`)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ href: `/posts/link-${tag}`, label: 'Update', title: doc.title })
    expect(JSON.stringify(hits)).not.toMatch(/\/api\/|documents/)
  })

  it('pages_stably_across_equal_dates_and_handles_a_page_past_the_end', async () => {
    const stamp = new Date(Date.now() - DAY).toISOString()
    for (let i = 0; i < 14; i++) await post(`Paged${tag} item ${i}`, { publishedAt: stamp })
    const first = await search(`paged${tag}`, 'all', 1)
    const second = await search(`paged${tag}`, 'all', 2)
    expect(first.hits).toHaveLength(12)
    expect(second.hits).toHaveLength(2)
    expect(first.totalDocs).toBe(14)
    expect(first.totalPages).toBe(2)
    expect(new Set([...first.hits, ...second.hits].map((h) => h.href)).size).toBe(14)
    const past = await search(`paged${tag}`, 'all', 9)
    expect(past.hits).toEqual([])
    expect(past.totalPages).toBe(2)
  })

  it('keeps_inclusion_and_href_while_only_the_recent_flag_changes_with_age', async () => {
    const published = new Date('2026-06-01T00:00:00.000Z')
    const doc = await post(`Vintage${tag} note`, { publishedAt: published.toISOString() })
    const day29 = await search(`vintage${tag}`, 'all', 1, new Date(published.getTime() + 29 * DAY))
    const day31 = await search(`vintage${tag}`, 'all', 1, new Date(published.getTime() + 31 * DAY))
    expect(day29.hits.map((h) => h.href)).toEqual(day31.hits.map((h) => h.href))
    expect(day29.hits[0].title).toBe(doc.title)
    expect(day29.hits[0].recent).toBe(true)
    expect(day31.hits[0].recent).toBe(false)
  })

  it('treats_markup_and_sql_like_text_as_data', async () => {
    await post(`Safe${tag} item`)
    for (const hostile of [
      "'; drop table search; --",
      '<script>alert(1)</script>',
      'a'.repeat(100),
      '\u0000x',
      '😀😀',
    ])
      await expect(search(hostile)).resolves.toMatchObject({ totalDocs: 0 })
    expect((await search(`safe${tag}`)).totalDocs).toBe(1)
  })

  it('surfaces_a_failed_query_instead_of_an_empty_result', async () => {
    const failure = vi.spyOn(payload, 'find').mockRejectedValueOnce(new Error('Synthetic outage'))
    try {
      await expect(search(`anything${tag}`)).rejects.toThrow('Synthetic outage')
    } finally {
      failure.mockRestore()
    }
  })
  it('finds_issuances_by_normalized_identifier_and_alias_once_their_routes_are_live', async () => {
    const issuance = await records.issuance({
      title: `Resolved${tag} measure`,
      identifier: `Res. No. 2026-${tag}`,
    })
    const reindexed = await handleEndpoints({
      config,
      request: new Request('http://127.0.0.1:3003/api/search/reindex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.publisher}`,
        },
        body: JSON.stringify({ collections: ['issuances'] }),
      }),
    })
    expect(reindexed.status).toBe(200)
    const target = searchTargets.issuances as { live: boolean }
    target.live = true
    try {
      for (const q of [`res no 2026${tag}`, `Resolution No. 2026-${tag}`, `RES-NO-2026${tag}`]) {
        const { hits } = await search(q)
        expect(hits, q).toHaveLength(1)
        expect(hits[0]).toMatchObject({
          label: 'Issuance',
          href: `/issuances/${issuance.slug}`,
          identifier: `Res. No. 2026-${tag}`,
        })
      }
      expect((await search(`eo no 2026${tag}`)).hits).toEqual([])
      expect((await search(`resolved${tag}`, 'issuances')).totalDocs).toBe(1)
      expect((await search(`resolved${tag}`, 'updates')).totalDocs).toBe(0)
    } finally {
      target.live = false
    }
  })
})
