import type { CollectionSlug, PayloadRequest, Where } from 'payload'

// Native latest=true is not exclusive when version timestamps tie.
export async function hasDomainKey(
  req: PayloadRequest,
  collection: CollectionSlug,
  key: Where,
  ownID?: number | string,
): Promise<boolean> {
  const canonical = await req.payload.find({
    collection,
    req,
    overrideAccess: false,
    draft: false,
    depth: 0,
    limit: 1,
    where: { and: [key, ...(ownID === undefined ? [] : [{ id: { not_equals: ownID } }])] },
  })
  if (canonical.docs.length) return true
  const excluded: (number | string)[] = ownID === undefined ? [] : [ownID]
  const versionKey = Object.fromEntries(
    Object.entries(key).map(([field, value]) => [`version.${field}`, value]),
  )
  while (true) {
    const candidates = await req.payload.findVersions({
      collection,
      req,
      overrideAccess: false,
      depth: 0,
      limit: 1,
      sort: ['-updatedAt', '-id'],
      where: {
        and: [
          versionKey,
          { parent: { exists: true } },
          ...(excluded.length ? [{ parent: { not_in: excluded } }] : []),
        ],
      },
    })
    const candidate = candidates.docs[0]
    if (!candidate) return false
    const parent = candidate.parent
    if (parent === null || parent === undefined) return false
    const head = await req.payload.findVersions({
      collection,
      req,
      overrideAccess: false,
      depth: 0,
      limit: 1,
      where: { parent: { equals: parent } },
      sort: ['-updatedAt', '-id'],
    })
    if (head.docs[0]?.id === candidate.id) return true
    excluded.push(parent)
  }
}
