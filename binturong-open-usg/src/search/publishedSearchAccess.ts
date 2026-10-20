import type { Access, AccessResult } from 'payload'

import { isReindexRequest } from './authorizeReindex'

export const publishedSearchAccess: Access = async ({ req }): Promise<AccessResult> => {
  if (isReindexRequest(req)) return true
  const { docs } = await req.payload.find({
    collection: 'posts',
    overrideAccess: false,
    draft: false,
    depth: 0,
    pagination: false,
    limit: 0,
    select: {},
    where: { _status: { equals: 'published' } },
    req,
  })
  return {
    and: [
      { 'doc.relationTo': { equals: 'posts' } },
      { 'doc.value': { in: docs.map(({ id }) => id) } },
    ],
  }
}
