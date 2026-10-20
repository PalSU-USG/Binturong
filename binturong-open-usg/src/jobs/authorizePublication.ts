import { createHash } from 'node:crypto'
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

export type PublicationProof = {
  accountID: number
  collection: 'pages' | 'posts'
  documentID: number
  versionID: number
  versionHash: string
}

export const positiveID = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

function validProof(value: unknown): value is PublicationProof & Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proof = value as Partial<PublicationProof>
  return (
    positiveID(proof.accountID) &&
    positiveID(proof.documentID) &&
    positiveID(proof.versionID) &&
    (proof.collection === 'pages' || proof.collection === 'posts') &&
    typeof proof.versionHash === 'string' &&
    /^[a-f0-9]{64}$/.test(proof.versionHash)
  )
}

export async function latestPublicationVersion(
  req: PayloadRequest,
  collection: 'pages' | 'posts',
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
  if (!version) throw new APIError('Save the document before scheduling it', 409)
  return {
    ...version,
    id: Number(version.id),
    hash: createHash('sha256')
      .update(
        JSON.stringify({
          version: version.version,
          updatedAt: version.updatedAt,
        }),
      )
      .digest('hex'),
  }
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

export const scheduledPublication: TaskHandler<'schedulePublish'> = async ({
  job,
  req: runner,
}) => {
  // Job bookkeeping uses separate native transactions. Own the publication and receipt together.
  const req = await createLocalReq({}, runner.payload)
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

    const proof =
      positiveID(input.appliedVersionID) && typeof input.appliedVersionHash === 'string'
        ? { ...input, versionID: input.appliedVersionID, versionHash: input.appliedVersionHash }
        : input
    await authorizePublication(req, proof)
    if (!positiveID(input.appliedVersionID)) {
      const reviewed = await latestPublicationVersion(req, input.collection, input.documentID)
      const data = {
        ...reviewed.version,
        _status: input.type === 'publish' ? ('published' as const) : ('draft' as const),
      }
      if ('populatedAuthors' in data) delete data.populatedAuthors
      await req.payload.update({
        collection: input.collection,
        id: input.documentID,
        data,
        depth: 0,
        draft: false,
        overrideAccess: false,
        req,
      })
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
  }
}
