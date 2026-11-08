import type { Access, AccessResult, Where } from 'payload'

import { isReindexRequest } from './authorizeReindex'
import { indexedCollections } from './searchTargets'

/**
 * A search row is readable only while its source record is published, checked per source
 * collection and paired with the row's own relation. With nothing published the constraint
 * matches no row (a zero id), so an empty set is an empty list rather than an error.
 */
export const publishedSearchAccess: Access = async ({ req }): Promise<AccessResult> => {
  if (isReindexRequest(req)) return true
  const clauses: Where[] = []
  for (const collection of indexedCollections) {
    const { docs } = await req.payload.find({
      collection,
      overrideAccess: false,
      draft: false,
      depth: 0,
      pagination: false,
      limit: 0,
      select: {},
      where: { _status: { equals: 'published' } },
      req,
    })
    if (docs.length > 0)
      clauses.push({
        and: [
          { 'doc.relationTo': { equals: collection } },
          { 'doc.value': { in: docs.map(({ id }) => id) } },
        ],
      })
  }
  return clauses.length > 0 ? { or: clauses } : { id: { equals: 0 } }
}
