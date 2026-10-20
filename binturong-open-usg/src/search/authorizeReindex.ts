import type {
  Access,
  CollectionBeforeOperationHook,
  PayloadHandler,
  PayloadRequest,
  Plugin,
} from 'payload'
import { commitTransaction, initTransaction, killTransaction } from 'payload'

import { publishContent } from '@/access/contentAccess'

const reindexRequests = new WeakMap<PayloadRequest, { transactionID?: number | string }>()

export const trustedSearchWrite: Access = ({ req }) => reindexRequests.has(req)

export function isReindexRequest(req: PayloadRequest): boolean {
  return reindexRequests.has(req)
}

async function requireReindexTransaction(req: PayloadRequest): Promise<void> {
  const state = reindexRequests.get(req)
  if (state && (!state.transactionID || state.transactionID !== (await req.transactionID))) {
    throw new Error('Search rebuild lost its original transaction')
  }
}

async function guardReindexTransaction({
  req,
  operation,
}: Parameters<CollectionBeforeOperationHook>[0]): Promise<void> {
  if (operation === 'create' || operation === 'update' || operation === 'delete') {
    await requireReindexTransaction(req)
  }
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
    const state: { transactionID?: number | string } = {}
    reindexRequests.set(req, state)
    let ownsTransaction = false
    try {
      ownsTransaction = await initTransaction(req)
      state.transactionID = await req.transactionID
      await requireReindexTransaction(req)
      // shortcut: clear orphan rows from the Posts-only index; scope cleanup before adding another source.
      await req.payload.delete({ collection: 'search', where: {}, overrideAccess: false, req })
      const response = await handler(req)
      await requireReindexTransaction(req)
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
          hooks: {
            ...collection.hooks,
            beforeOperation: [
              guardReindexTransaction,
              ...(collection.hooks?.beforeOperation ?? []),
            ],
          },
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
