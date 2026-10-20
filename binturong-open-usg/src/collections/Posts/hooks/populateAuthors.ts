import type { CollectionAfterReadHook } from 'payload'
export const populateAuthors: CollectionAfterReadHook = async ({ doc, req, req: { payload } }) => {
  doc.populatedAuthors = []
  for (const author of doc.authors ?? []) {
    const id = typeof author === 'object' ? author?.id : author
    if (!id) continue
    // Public author names are the only privileged user projection.
    const authorDoc = await payload.findByID({
      id,
      collection: 'users',
      overrideAccess: true,
      depth: 0,
      select: { name: true },
      disableErrors: true,
      req,
    })
    if (authorDoc) doc.populatedAuthors.push({ id: authorDoc.id, name: authorDoc.name })
  }
  return doc
}
