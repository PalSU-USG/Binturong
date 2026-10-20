import { randomUUID } from 'node:crypto'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createLocalReq,
  getPayload,
  handleEndpoints,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'
import { GRAPHQL_POST } from '@payloadcms/next/routes'

import config from '@/payload.config'
import { userRoles, type UserRole } from '@/access/roles'
import type { Post } from '@/payload-types'
import { getCachedDocument } from '@/utilities/getDocument'
import { getCachedGlobal } from '@/utilities/getGlobals'
import { getRedirects } from '@/utilities/getRedirects'
import { ArchiveBlock } from '@/blocks/ArchiveBlock/Component'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import { revalidateTag } from 'next/cache'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import { syntheticContent } from '../helpers/contentFixtures'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('@/components/CollectionArchive', () => ({
  CollectionArchive: ({ posts }: { posts: Post[] }) =>
    React.createElement('p', null, posts.map(({ title }) => title).join(', ')),
}))
vi.mock('@/components/RichText', () => ({ default: () => null }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`Synthetic redirect: ${path}`)
  },
  notFound: () => {
    throw new Error('Synthetic not found')
  },
}))

const context = { disableRevalidate: true }

describe('public queries and search maintenance', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const posts: Post[] = []
  const redirects: number[] = []
  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    for (const id of redirects) await payload.delete({ collection: 'redirects', id, context })
    for (const { id } of posts) await payload.delete({ collection: 'posts', id, context })
    await payload.updateGlobal({ slug: 'header', data: { navItems: [] }, context })
    await removeTestAccounts(
      payload,
      Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    )
  })
  const actor = (role: UserRole) => ({ ...fixtures.users[role], collection: 'users' as const })
  async function createPost(published = true) {
    const doc = await payload.create({
      collection: 'posts',
      data: {
        title: `Synthetic ${published ? 'public' : 'private'} ${randomUUID()}`,
        slug: `synthetic-${randomUUID()}`,
        content: syntheticContent,
        _status: published ? 'published' : 'draft',
      },
      draft: !published,
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    posts.push(doc)
    return doc
  }
  async function request(path: string, role?: UserRole, method = 'GET', body?: unknown) {
    return handleEndpoints({
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
  }

  it('keeps_cached_document_queries_published_only_and_preserves_the_public_revision', async () => {
    const privatePost = await createPost(false)
    expect(await getCachedDocument('posts', privatePost.slug)()).toBeUndefined()
    const publicPost = await createPost()
    await payload.update({
      collection: 'posts',
      id: publicPost.id,
      data: { title: 'Synthetic private revision' },
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      context,
    })
    expect((await getCachedDocument('posts', publicPost.slug)())?.title).toBe(publicPost.title)
  })

  it.each(['redirect', 'global'])('does_not_populate_private_%s_references', async (kind) => {
    const doc = await createPost(false)
    const reference = { relationTo: 'posts' as const, value: doc.id }
    const redirect = await payload.create({
      collection: 'redirects',
      data: { from: `/synthetic-${randomUUID()}`, to: { type: 'reference', reference } },
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    redirects.push(redirect.id)
    await payload.updateGlobal({
      slug: 'header',
      data: {
        navItems: [
          { link: { type: 'reference', reference, label: 'Synthetic navigation fixture' } },
        ],
      },
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    const result = kind === 'redirect' ? await getRedirects() : await getCachedGlobal('header', 2)()
    expect(JSON.stringify(result)).not.toContain(doc.title)
  })

  it.each(['collection', 'selection'] as const)(
    'filters_%s_archives_using_current_published_records',
    async (populateBy) => {
      const privatePost = await createPost(false)
      const publicPost = await createPost()
      const selected = renderToStaticMarkup(
        await ArchiveBlock({
          blockType: 'archive',
          populateBy,
          limit: 100,
          selectedDocs: [
            { relationTo: 'posts', value: privatePost },
            {
              relationTo: 'posts',
              value: { ...publicPost, title: 'Synthetic stale selected title' },
            },
          ],
        }),
      )
      expect(selected).not.toContain(privatePost.title)
      expect(selected).not.toContain('Synthetic stale selected title')
      expect(selected).toContain(publicPost.title)
    },
  )

  it('hides_private_related_posts_in_public_rest_reads', async () => {
    const privatePost = await createPost(false)
    const publicPost = await createPost()
    await payload.update({
      collection: 'posts',
      id: publicPost.id,
      data: { relatedPosts: [privatePost.id] },
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    const response = await request(`posts/${publicPost.id}?depth=2`)
    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).not.toContain(privatePost.title)
  })

  it('denies_direct_search_writes_for_every_user_even_with_forged_context', async () => {
    const doc = await createPost()
    const indexed = await payload.find({
      collection: 'search',
      where: { 'doc.value': { equals: doc.id } },
      depth: 0,
    })
    expect(indexed.docs).toHaveLength(1)
    for (const role of userRoles) {
      expect(
        (
          await request('search', role, 'POST', {
            title: 'Synthetic forged result',
            doc: { relationTo: 'posts', value: doc.id },
            context: { reindex: true, trustedSearch: true },
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await request(`search/${indexed.docs[0].id}`, role, 'PATCH', {
            title: 'Synthetic forged title',
            context: { reindex: true },
          })
        ).status,
      ).toBe(403)
      expect((await request(`search/${indexed.docs[0].id}`, role, 'DELETE')).status).toBe(403)
    }
    expect((await payload.findByID({ collection: 'search', id: indexed.docs[0].id })).title).toBe(
      doc.title,
    )
  })

  it.each([undefined, 'editor'] as const)('denies_native_reindex_for_%s', async (role) => {
    expect(
      (
        await request('search/reindex', role, 'POST', {
          collections: ['posts'],
          context: { reindex: true },
        })
      ).status,
    ).toBe(403)
  })
  it('allows_publisher_reindex_and_rejects_bad_collections', async () => {
    for (const role of ['publisher', 'admin', 'super_admin'] as const)
      expect(
        (await request('search/reindex', role, 'POST', { collections: ['posts'] })).status,
      ).toBe(200)
    for (const collections of [null, 'posts', [], ['users'], ['posts', 'users']])
      expect((await request('search/reindex', 'publisher', 'POST', { collections })).status).toBe(
        400,
      )
  })

  it('keeps_draft_changes_out_of_search_and_hides_stale_rows_after_failed_withdrawal_sync', async () => {
    const doc = await createPost()
    await payload.update({
      collection: 'posts',
      id: doc.id,
      data: { title: 'Synthetic private search title' },
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      context,
    })
    const indexed = await payload.find({
      collection: 'search',
      where: { 'doc.value': { equals: doc.id } },
      depth: 0,
    })
    expect(indexed.docs).toHaveLength(1)
    expect(indexed.docs[0].title).toBe(doc.title)
    const originalDelete = payload.delete.bind(payload)
    let failures = 0
    const failedDelete = vi.spyOn(payload, 'delete').mockImplementation(async (options) => {
      if (options.collection === 'search') {
        failures++
        throw new Error('Synthetic search outage')
      }
      return originalDelete(options)
    })
    try {
      await payload.update({
        collection: 'posts',
        id: doc.id,
        data: { _status: 'draft' },
        user: actor('publisher'),
        overrideAccess: false,
        context,
      })
    } finally {
      failedDelete.mockRestore()
    }
    expect(failures).toBeGreaterThan(0)
    expect((await payload.findByID({ collection: 'search', id: indexed.docs[0].id })).title).toBe(
      doc.title,
    )
    const publicSearch = await request('search?limit=100')
    expect(publicSearch.status).toBe(200)
    expect(JSON.stringify(await publicSearch.json())).not.toContain(doc.title)
    const response = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ Searches(limit:100) { docs { title } } }' }),
      }),
    )
    const result = await response.json()
    expect(result.errors).toBeUndefined()
    expect(JSON.stringify(result.data)).not.toContain(doc.title)
    expect(
      (await request('search/reindex', 'publisher', 'POST', { collections: ['posts'] })).status,
    ).toBe(200)
    expect(
      await payload.findByID({ collection: 'search', id: indexed.docs[0].id, disableErrors: true }),
    ).toBeNull()
  })

  it('does_not_accept_forged_author_projection', async () => {
    const doc = await payload.create({
      collection: 'posts',
      data: {
        title: `Synthetic author ${randomUUID()}`,
        slug: `synthetic-${randomUUID()}`,
        content: syntheticContent,
        _status: 'published',
        populatedAuthors: [
          { id: String(fixtures.users.super_admin.id), name: 'Synthetic forged public author' },
        ],
      },
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    posts.push(doc)
    expect(JSON.stringify(doc.populatedAuthors)).not.toContain('Synthetic forged public author')
  })

  it('propagates_author_lookup_failures', async () => {
    const doc = await createPost()
    await payload.update({
      collection: 'posts',
      id: doc.id,
      data: { authors: [fixtures.users.editor.id] },
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    const findByID = payload.findByID.bind(payload)
    const failure = vi.spyOn(payload, 'findByID').mockImplementation(async (options) => {
      if (options.collection === 'users') throw new Error('Synthetic author lookup outage')
      return findByID(options)
    })
    try {
      await expect(
        payload.findByID({ collection: 'posts', id: doc.id, overrideAccess: false, depth: 0 }),
      ).rejects.toThrow('Synthetic author lookup outage')
    } finally {
      failure.mockRestore()
    }
  })

  it('expires_the_cached_public_document_on_withdrawal', async () => {
    const doc = await createPost()
    vi.mocked(revalidateTag).mockClear()
    await payload.update({
      collection: 'posts',
      id: doc.id,
      data: { _status: 'draft' },
      user: actor('publisher'),
      overrideAccess: false,
    })
    expect(revalidateTag).toHaveBeenCalledWith(`posts_${doc.slug}`, { expire: 0 })
  })

  it('resolves_redirects_by_record_id_and_skips_withdrawn_targets', async () => {
    const doc = await createPost()
    const from = `/synthetic-${randomUUID()}`
    const redirect = await payload.create({
      collection: 'redirects',
      data: { from, to: { type: 'reference', reference: { relationTo: 'posts', value: doc.id } } },
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    redirects.push(redirect.id)
    await expect(PayloadRedirects({ url: from, disableNotFound: true })).rejects.toThrow(
      `Synthetic redirect: /posts/${doc.slug}`,
    )
    await payload.update({
      collection: 'posts',
      id: doc.id,
      data: { _status: 'draft' },
      user: actor('publisher'),
      overrideAccess: false,
      context,
    })
    await expect(PayloadRedirects({ url: from, disableNotFound: true })).resolves.toBeNull()
  })

  it('reports_failed_native_reindex_and_restores_the_prior_index_before_retry', async () => {
    const doc = await createPost()
    const before = await payload.find({
      collection: 'search',
      depth: 0,
      pagination: false,
      limit: 0,
    })
    const create = payload.create.bind(payload)
    const failure = vi.spyOn(payload, 'create').mockImplementation(async (options) => {
      if (options.collection === 'search') throw new Error('Synthetic indexing outage')
      return create(options)
    })
    try {
      expect(
        (await request('search/reindex', 'publisher', 'POST', { collections: ['posts'] })).status,
      ).toBe(500)
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
    expect(
      (await request('search/reindex', 'publisher', 'POST', { collections: ['posts'] })).status,
    ).toBe(200)
    const results = await payload.find({
      collection: 'search',
      where: { 'doc.value': { equals: doc.id } },
    })
    expect(results.docs).toHaveLength(1)
    expect(results.docs[0].title).toBe(doc.title)
  })

  it('returns_an_empty_public_search_when_no_sources_are_published', async () => {
    await createPost()
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    try {
      await payload.db.updateMany({
        collection: 'posts',
        data: { _status: 'draft' },
        where: { _status: { equals: 'published' } },
        req,
      })
      expect(
        (
          await payload.count({
            collection: 'posts',
            where: { _status: { equals: 'published' } },
            req,
          })
        ).totalDocs,
      ).toBe(0)
      const search = await payload.find({ collection: 'search', overrideAccess: false, req })
      expect(search.docs).toEqual([])
    } finally {
      await killTransaction(req)
    }
  })

  it('prevents_later_writes_when_a_real_native_failure_ends_the_reindex_transaction', async () => {
    await createPost()
    await createPost()
    await createPost()
    const before = await payload.find({
      collection: 'search',
      depth: 0,
      pagination: false,
      limit: 0,
    })
    const search = payload.collections.search.config
    const originalHooks = search.hooks.beforeChange
    const transactions: unknown[] = []
    search.hooks.beforeChange = [
      ...originalHooks,
      async ({ data, operation, req }) => {
        if (operation === 'create') {
          transactions.push(await req.transactionID)
          if (transactions.length === 1) throw new Error('Synthetic native search-hook failure')
        }
        return data
      },
    ]
    try {
      expect(
        (await request('search/reindex', 'publisher', 'POST', { collections: ['posts'] })).status,
      ).toBe(500)
    } finally {
      search.hooks.beforeChange = originalHooks
    }
    expect(transactions).toHaveLength(1)
    const after = await payload.find({
      collection: 'search',
      depth: 0,
      pagination: false,
      limit: 0,
    })
    expect(after.docs).toEqual(before.docs)
    expect(
      (await request('search/reindex', 'publisher', 'POST', { collections: ['posts'] })).status,
    ).toBe(200)
  })
})
