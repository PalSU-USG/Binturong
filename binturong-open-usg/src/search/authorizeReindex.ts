import type { Access, PayloadHandler, PayloadRequest, Plugin } from 'payload'
import { commitTransaction, initTransaction, killTransaction } from 'payload'

import { publishContent } from '@/access/contentAccess'

const reindexRequests = new WeakSet<PayloadRequest>()

export const trustedSearchWrite: Access = ({ req }) => reindexRequests.has(req)

export function isReindexRequest(req: PayloadRequest): boolean {
  return reindexRequests.has(req)
}

export function authorizeReindex(handler: PayloadHandler): PayloadHandler {
  return async (req) => {
    if (!(await publishContent({ req })))
      return Response.json({ error: 'Publishing permission is required' }, { status: 403 })
    let body: unknown
    try {
      body = await req.json?.()
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (
      !body ||
      typeof body !== 'object' ||
      !('collections' in body) ||
      !Array.isArray(body.collections) ||
      body.collections.length !== 1 ||
      body.collections[0] !== 'posts'
    ) {
      return Response.json({ error: 'Choose the posts collection' }, { status: 400 })
    }
    const originalJSON = req.json
    req.json = async () => body
    reindexRequests.add(req)
    let ownsTransaction = false
    try {
      ownsTransaction = await initTransaction(req)
      // shortcut: clear orphan rows from the Posts-only index; scope cleanup before adding another source.
      await req.payload.delete({ collection: 'search', where: {}, overrideAccess: false, req })
      const response = await handler(req)
      if (!response.ok) {
        if (ownsTransaction) await killTransaction(req)
        return response
      }
      const sources = await req.payload.find({
        collection: 'posts',
        overrideAccess: false,
        draft: false,
        depth: 0,
        pagination: false,
        limit: 0,
        select: { title: true, slug: true },
        where: { _status: { equals: 'published' } },
        req,
      })
      const indexes = await req.payload.find({
        collection: 'search',
        overrideAccess: false,
        depth: 0,
        pagination: false,
        limit: 0,
        select: { title: true, slug: true, doc: true },
        req,
      })
      const expected = new Map(sources.docs.map((doc) => [String(doc.id), doc]))
      const actual = new Set(indexes.docs.map((doc) => doc.doc && String(doc.doc.value)))
      if (
        indexes.docs.length !== expected.size ||
        actual.size !== expected.size ||
        indexes.docs.some((index) => {
          const source = index.doc && expected.get(String(index.doc.value))
          return (
            !index.doc ||
            index.doc.relationTo !== 'posts' ||
            !source ||
            index.title !== source.title ||
            index.slug !== source.slug
          )
        })
      )
        throw new Error('Search index did not converge to its published sources')
      if (ownsTransaction) await commitTransaction(req)
      return response
    } catch (error) {
      if (ownsTransaction) await killTransaction(req)
      req.payload.logger.error({ err: error }, 'Search reindex failed')
      return Response.json({ error: 'Search index update failed. Try again.' }, { status: 500 })
    } finally {
      reindexRequests.delete(req)
      req.json = originalJSON
    }
  }
}

export const protectSearchReindex: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((collection) =>
    collection.slug !== 'search'
      ? collection
      : {
          ...collection,
          endpoints: (collection.endpoints || []).map((endpoint) =>
            endpoint.method === 'post' && endpoint.path === '/reindex'
              ? {
                  ...endpoint,
                  handler: authorizeReindex(endpoint.handler),
                }
              : endpoint,
          ),
        },
  ),
})
