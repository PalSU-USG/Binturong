import { createHash } from 'node:crypto'
import { APIError, type PayloadRequest } from 'payload'
import type { DomainCollection } from '@/collections/shared/domainCollections'

export type PublicationCollection = 'pages' | 'posts' | DomainCollection
export type RevisionProof = { versionID: number; versionHash: string }
export const positiveID = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
export const serialID = (value: unknown): value is number =>
  positiveID(value) && value <= 2_147_483_647
export function validRevisionProof(value: unknown): value is RevisionProof {
  if (!value || typeof value !== 'object') return false
  const proof = value as Partial<RevisionProof>
  return (
    serialID(proof.versionID) &&
    typeof proof.versionHash === 'string' &&
    /^[a-f0-9]{64}$/.test(proof.versionHash)
  )
}
export const versionHash = (version: { version: unknown; updatedAt: string }) =>
  createHash('sha256')
    .update(JSON.stringify({ version: version.version, updatedAt: version.updatedAt }))
    .digest('hex')

export async function latestPublicationVersion<T extends PublicationCollection>(
  req: PayloadRequest,
  collection: T,
  documentID: number,
) {
  const result = await req.payload.findVersions({
    collection,
    where: { parent: { equals: documentID } },
    sort: ['-updatedAt', '-id'],
    depth: 0,
    limit: 1,
    overrideAccess: false,
    req,
  })
  const version = result.docs[0]
  if (!version) throw new APIError('Save the document before reviewing it', 409)
  return { ...version, id: Number(version.id), hash: versionHash(version) }
}
