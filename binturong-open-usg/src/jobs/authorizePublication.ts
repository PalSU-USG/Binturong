import {
  APIError,
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type PayloadRequest,
  type TaskHandler,
} from 'payload'

import { hasRole } from '@/access/roles'
import { lockAccounts } from '@/collections/Users/accountProvisioning'
import { isDomainCollection } from '@/collections/shared/domainCollections'
import { transitionDomainRecord } from '@/collections/shared/transitionDomainRecord'
import { clearOfficialPreflight, preflightOfficialPublication } from '@/storage/officialPublication'
import {
  latestPublicationVersion,
  serialID,
  type PublicationCollection,
} from './publicationRevision'
export { latestPublicationVersion, positiveID } from './publicationRevision'

export type PublicationProof = {
  accountID: number
  collection: PublicationCollection
  documentID: number
  versionID: number
  versionHash: string
}

function validProof(value: unknown): value is PublicationProof & Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proof = value as Partial<PublicationProof>
  return (
    serialID(proof.accountID) &&
    serialID(proof.documentID) &&
    serialID(proof.versionID) &&
    (proof.collection === 'pages' ||
      proof.collection === 'posts' ||
      isDomainCollection(proof.collection)) &&
    typeof proof.versionHash === 'string' &&
    /^[a-f0-9]{64}$/.test(proof.versionHash)
  )
}

export async function authorizePublication(
  req: PayloadRequest,
  proof: PublicationProof,
): Promise<void> {
  if (!validProof(proof))
    throw new APIError('Re-schedule this publication with a reviewed revision', 403)
  await lockAccounts(req)
  // Restore the authorizer, never the cron runner, as the content operation's identity.
  const user = await req.payload.findByID({
    collection: 'users',
    id: proof.accountID,
    depth: 0,
    req,
    disableErrors: true,
  })
  if (!user || user.disabled || !hasRole(user.role, 'publisher'))
    throw new APIError('The scheduling account no longer has publishing permission', 403)
  req.user = { ...user, collection: 'users' }
  const version = await latestPublicationVersion(req, proof.collection, proof.documentID)
  if (version.id !== proof.versionID || version.hash !== proof.versionHash)
    throw new APIError('The reviewed revision changed; re-schedule publication', 409)
}

// Provider verification must finish before the job's transaction and editorial lock begin.
async function preflightScheduledOfficialFiles(
  req: PayloadRequest,
  payload: PayloadRequest['payload'],
  jobID: number | string,
): Promise<void> {
  const stored = await payload.findByID({
    collection: 'payload-jobs',
    id: jobID,
    depth: 0,
    disableErrors: true,
  })
  const input = stored?.input
  if (
    stored?.taskSlug !== 'schedulePublish' ||
    !validProof(input) ||
    input.type !== 'publish' ||
    input.appliedVersionID !== undefined ||
    input.appliedVersionHash !== undefined ||
    (input.collection !== 'issuances' && input.collection !== 'reports')
  )
    return // The locked handler rejects invalid, receipt-bearing and non-official jobs itself.
  const user = await payload.findByID({
    collection: 'users',
    id: input.accountID,
    depth: 0,
    disableErrors: true,
  })
  if (!user || user.disabled || !hasRole(user.role, 'publisher')) return
  req.user = { ...user, collection: 'users' }
  await preflightOfficialPublication(req, {
    collection: input.collection,
    documentID: input.documentID,
    action: 'publish',
    expected: { versionID: input.versionID, versionHash: input.versionHash },
  })
}

export const scheduledPublication: TaskHandler<'schedulePublish'> = async ({
  job,
  req: runner,
}) => {
  // Job bookkeeping uses separate native transactions. Own the publication and receipt together.
  const req = await createLocalReq({}, runner.payload)
  await preflightScheduledOfficialFiles(req, runner.payload, job.id)
  await initTransaction(req)
  const transactionID = await req.transactionID
  const requireTransaction = async () => {
    if (!transactionID || (await req.transactionID) !== transactionID)
      throw new APIError('The publication transaction was aborted', 500)
  }
  try {
    await lockAccounts(req)
    const stored = await req.payload.findByID({
      collection: 'payload-jobs',
      id: job.id,
      depth: 0,
      req,
    })
    const input = stored.input
    if (
      stored.taskSlug !== 'schedulePublish' ||
      !validProof(input) ||
      (input.type !== 'publish' && input.type !== 'unpublish')
    )
      throw new APIError('Re-schedule this publication with a reviewed revision', 403)

    const hasReceipt =
      input.appliedVersionID !== undefined || input.appliedVersionHash !== undefined
    let proof = input
    if (hasReceipt) {
      const appliedProof = {
        ...input,
        versionID: input.appliedVersionID,
        versionHash: input.appliedVersionHash,
      }
      if (!validProof(appliedProof))
        throw new APIError('The publication receipt is incomplete or invalid', 403)
      proof = appliedProof
    }
    await authorizePublication(req, proof)
    if (!hasReceipt) {
      if (isDomainCollection(input.collection)) {
        await transitionDomainRecord(req, {
          collection: input.collection,
          documentID: input.documentID,
          action: input.type === 'publish' ? 'publish' : 'withdraw',
          expected: { versionID: input.versionID, versionHash: input.versionHash },
        })
      } else {
        const reviewed = await latestPublicationVersion(req, input.collection, input.documentID)
        const data = {
          ...reviewed.version,
          _status: input.type === 'publish' ? ('published' as const) : ('draft' as const),
        }
        if ('populatedAuthors' in data) delete data.populatedAuthors
        const { clearPreservedLastEditedBy, preserveLastEditedBy } = await import(
          '@/fields/lastEditedBy'
        )
        preserveLastEditedBy(req, (reviewed.version as { lastEditedBy?: unknown }).lastEditedBy)
        try {
          await req.payload.update({
            collection: input.collection,
            id: input.documentID,
            data,
            depth: 0,
            draft: false,
            overrideAccess: false,
            req,
          })
        } finally {
          clearPreservedLastEditedBy(req)
        }
      }
      await requireTransaction()
      const applied = await latestPublicationVersion(req, input.collection, input.documentID)
      await req.payload.update({
        collection: 'payload-jobs',
        id: stored.id,
        req,
        data: {
          input: { ...input, appliedVersionID: applied.id, appliedVersionHash: applied.hash },
        },
      })
    }
    await requireTransaction()
    await commitTransaction(req)
    return { output: {} }
  } catch (error) {
    await killTransaction(req)
    throw error
  } finally {
    clearOfficialPreflight(req)
  }
}
