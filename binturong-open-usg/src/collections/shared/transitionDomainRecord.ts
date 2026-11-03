import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
} from 'payload'
import { getActiveAccount } from '@/access/activeAccount'
import { hasRole } from '@/access/roles'
import { lockAccounts } from '@/collections/Users/accountProvisioning'
import {
  latestPublicationVersion,
  serialID,
  validRevisionProof,
  versionHash,
  type RevisionProof,
} from '@/jobs/publicationRevision'
import { isDomainCollection, type DomainCollection } from './domainCollections'
import { validateDomainPublication } from './validateDomainPublication'
import { validateDomainWithdrawal } from './protectDomainReferences'

export type { RevisionProof } from '@/jobs/publicationRevision'
export type TransitionInput = {
  collection: DomainCollection
  documentID: number
  action: 'publish' | 'withdraw' | 'restore'
  expected: RevisionProof
  restore?: RevisionProof
}
type Grant = {
  collection: DomainCollection
  documentID: number
  data: Record<string, unknown>
  used: boolean
}
const grants = new WeakMap<PayloadRequest, Grant>()
export const hasDomainTransition = (req: PayloadRequest) => grants.has(req)

export function consumeDomainTransition(
  req: PayloadRequest,
  collection: string,
  id: unknown,
  data: unknown,
): boolean {
  const grant = grants.get(req)
  if (
    !grant ||
    grant.used ||
    grant.collection !== collection ||
    String(grant.documentID) !== String(id) ||
    grant.data !== data
  )
    return false
  grant.used = true
  return true
}

export async function historicalDomainVersion(
  req: PayloadRequest,
  collection: DomainCollection,
  documentID: number,
  versionID: number,
) {
  if (!serialID(documentID) || !serialID(versionID))
    throw new APIError('Choose a valid record and historical version', 400)
  const result = await req.payload.findVersions({
    collection,
    req,
    overrideAccess: false,
    depth: 0,
    limit: 1,
    where: { and: [{ id: { equals: versionID } }, { parent: { equals: documentID } }] },
  })
  const version = result.docs[0]
  if (!version) throw new APIError('The reviewed version does not belong to this record', 409)
  return { ...version, id: Number(version.id), hash: versionHash(version) }
}

export async function transitionDomainRecord(req: PayloadRequest, input: TransitionInput) {
  if (
    !input ||
    !isDomainCollection(input.collection) ||
    !serialID(input.documentID) ||
    !['publish', 'withdraw', 'restore'].includes(input.action) ||
    !validRevisionProof(input.expected) ||
    (input.action === 'restore' ? !validRevisionProof(input.restore) : input.restore !== undefined)
  )
    throw new APIError('Choose a saved record, action and reviewed revision', 400)
  const ownsTransaction = await initTransaction(req)
  const transactionID = await req.transactionID
  const requireTransaction = async () => {
    if (
      !transactionID ||
      (await req.transactionID) !== transactionID ||
      !req.payload.db.sessions?.[transactionID]
    )
      throw new APIError('The publication transaction was aborted', 500)
  }
  try {
    await requireTransaction()
    await lockAccounts(req)
    const actor = await getActiveAccount(req)
    if (!actor || !hasRole(actor.role, 'publisher'))
      throw new APIError('Publishing permission is required', 403)
    const { collection, documentID, action, expected, restore } = input
    const current = await latestPublicationVersion(req, collection, documentID)
    const canonical = await req.payload.findByID({
      collection,
      id: documentID,
      draft: false,
      depth: 0,
      overrideAccess: false,
      req,
    })
    const audit = current.version.lastTransition
    const status: 'draft' | 'published' = action === 'withdraw' ? 'draft' : 'published'
    const reviewedProof =
      action === 'withdraw'
        ? {
            versionID: canonical.lastTransition?.reviewedVersionID,
            versionHash: canonical.lastTransition?.reviewedVersionHash,
          }
        : (restore ?? expected)
    if (!validRevisionProof(reviewedProof))
      throw new APIError('The published revision has no reviewed publication provenance', 409)
    if (current.id !== expected.versionID || current.hash !== expected.versionHash) {
      const previous = await req.payload.findVersions({
        collection,
        req,
        overrideAccess: false,
        depth: 0,
        limit: 1,
        sort: '-id',
        where: { and: [{ parent: { equals: documentID } }, { id: { less_than: current.id } }] },
      })
      const preceding = previous.docs[0]
      if (
        audit &&
        audit.actorID === actor.id &&
        audit.action === action &&
        audit.expectedVersionID === expected.versionID &&
        audit.expectedVersionHash === expected.versionHash &&
        audit.reviewedVersionID === reviewedProof.versionID &&
        audit.reviewedVersionHash === reviewedProof.versionHash &&
        current.version._status === status &&
        canonical._status === status &&
        canonical.lastTransition?.at === audit.at &&
        preceding &&
        Number(preceding.id) === expected.versionID &&
        versionHash(preceding) === expected.versionHash
      ) {
        if (ownsTransaction) await commitTransaction(req)
        return { documentID, action, alreadyApplied: true }
      }
      throw new APIError('The reviewed revision changed. Review the saved record again.', 409)
    }
    const historical = restore
      ? await historicalDomainVersion(req, collection, documentID, restore.versionID)
      : undefined
    if (historical && historical.hash !== restore?.versionHash)
      throw new APIError('The reviewed historical revision changed', 409)
    if (action === 'withdraw' && canonical._status !== 'published')
      throw new APIError('Only a published record can be withdrawn', 409)
    if (
      action === 'withdraw' &&
      !['publish', 'restore'].includes(canonical.lastTransition?.action ?? '')
    )
      throw new APIError('The published revision has no reviewed publication provenance', 409)
    const candidate = {
      ...(action === 'withdraw' ? canonical : (historical?.version ?? current.version)),
    } as Record<string, unknown>
    if (action === 'withdraw') {
      if (collection === 'organizations' || collection === 'offices')
        await validateDomainWithdrawal(req, collection, documentID)
    } else await validateDomainPublication(req, collection, candidate, { ...canonical })
    const at = new Date().toISOString()
    for (const field of ['id', 'createdAt', 'updatedAt', 'lastTransition', 'publishedAt'])
      delete candidate[field]
    const data = {
      ...candidate,
      generateSlug: false,
      _status: status,
      publishedAt: canonical.publishedAt ?? (action === 'withdraw' ? null : at),
      lastTransition: {
        action,
        actorID: actor.id,
        at,
        reviewedVersionID: reviewedProof.versionID,
        reviewedVersionHash: reviewedProof.versionHash,
        expectedVersionID: expected.versionID,
        expectedVersionHash: expected.versionHash,
      },
    }
    grants.set(req, { collection, documentID, data, used: false })
    await req.payload.update({
      collection,
      id: documentID,
      data,
      depth: 0,
      draft: false,
      overrideAccess: false,
      req,
    })
    await requireTransaction()
    if (ownsTransaction) await commitTransaction(req)
    return { documentID, action, alreadyApplied: false }
  } catch (error) {
    await killTransaction(req)
    if (transactionID && req.payload.db.sessions?.[transactionID])
      await req.payload.db.rollbackTransaction(transactionID)
    throw error
  } finally {
    grants.delete(req)
  }
}
