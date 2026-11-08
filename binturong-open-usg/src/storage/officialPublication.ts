import { APIError, ValidationError, type PayloadRequest } from 'payload'
import { getActiveAccount } from '@/access/activeAccount'
import { hasRole } from '@/access/roles'
import type { TransitionInput } from '@/collections/shared/transitionDomainRecord'
import { serialID, versionHash, type RevisionProof } from '@/jobs/publicationRevision'
import type { Document } from '@/payload-types'
import { acquireDocumentSlot } from './documentLimits'
import * as officialStorage from './officialStorage'
import { verifyPDF } from './verifyPDF'

type FilePath = 'mainDocument' | 'attachments'
type FileIdentity = {
  id: number
  organization: number
  sha256: string
  size: number
  storageKey: string
  verifiedAt: string
}
type Proof = {
  collection: TransitionInput['collection']
  documentID: number
  action: TransitionInput['action']
  revision: RevisionProof
  files: { path: FilePath; identity: FileIdentity }[]
  used: boolean
}
type Candidate = { organization?: unknown; mainDocument?: unknown; attachments?: unknown }

const proofs = new WeakMap<PayloadRequest, Proof>()
const READY_KEY = /^ready\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/
const isOfficial = (collection: string) => collection === 'issuances' || collection === 'reports'
const needsFiles = (input: TransitionInput) =>
  isOfficial(input.collection) && input.action !== 'withdraw'
const revisionOf = (input: TransitionInput) =>
  input.action === 'restore' ? input.restore! : input.expected

function relationID(value: unknown): number | null {
  const id =
    value && typeof value === 'object' && 'id' in value ? (value as { id: unknown }).id : value
  return typeof id === 'number' && serialID(id) ? id : null
}

function fail(req: PayloadRequest, errors: { path: string; message: string }[]): never {
  throw new ValidationError({ req, errors })
}

/** Ordered file references of a candidate; invalid values surface as errors, never as omissions. */
function referencedFiles(candidate: Candidate) {
  const refs: { path: FilePath; id: number | null }[] = [
    { path: 'mainDocument', id: relationID(candidate.mainDocument) },
  ]
  if (Array.isArray(candidate.attachments))
    for (const value of candidate.attachments)
      refs.push({ path: 'attachments', id: relationID(value) })
  return refs
}

function identityOf(doc: Document | null, organization: number | null): FileIdentity | string {
  if (!doc) return 'This document no longer exists.'
  if (doc.state !== 'ready') return 'Upload and verify this document in private storage first.'
  if (
    !organization ||
    relationID(doc.organization) !== organization ||
    !doc.storageKey ||
    !READY_KEY.test(doc.storageKey) ||
    !doc.sha256 ||
    !/^[a-f0-9]{64}$/.test(doc.sha256) ||
    typeof doc.size !== 'number' ||
    doc.size < 1 ||
    !doc.verifiedAt
  )
    return 'This document is not a verified file of the record’s organization.'
  return {
    id: Number(doc.id),
    organization,
    sha256: doc.sha256,
    size: doc.size,
    storageKey: doc.storageKey,
    verifiedAt: doc.verifiedAt,
  }
}

async function loadFiles(req: PayloadRequest, candidate: Candidate) {
  const organization = relationID(candidate.organization)
  const errors: { path: string; message: string }[] = []
  const files: Proof['files'] = []
  for (const { path, id } of referencedFiles(candidate)) {
    if (!id) {
      errors.push({ path, message: 'Choose an uploaded document.' })
      continue
    }
    const doc = await req.payload.findByID({
      collection: 'documents',
      id,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    const identity = identityOf(doc, organization)
    if (typeof identity === 'string') errors.push({ path, message: identity })
    else files.push({ path, identity })
  }
  if (errors.length) fail(req, errors)
  return files
}

/** Verifies every referenced object outside any lock/transaction and stores a request-bound proof. */
export async function preflightOfficialPublication(
  req: PayloadRequest,
  input: TransitionInput,
): Promise<void> {
  proofs.delete(req)
  if (!needsFiles(input)) return
  if (req.transactionID)
    throw new APIError('Publication preflight cannot run inside a database transaction', 409)
  const actor = await getActiveAccount(req)
  if (!actor || !hasRole(actor.role, 'publisher'))
    throw new APIError('Publishing permission is required', 403)

  const versions = await req.payload.findVersions({
    collection: input.collection,
    where: { parent: { equals: input.documentID } },
    sort: ['-updatedAt', '-id'],
    depth: 0,
    limit: 1,
    overrideAccess: false,
    req,
  })
  const head = versions.docs[0]
  // A stale or already-applied revision is the transition's retry/conflict business, not ours.
  if (
    !head ||
    Number(head.id) !== input.expected.versionID ||
    versionHash(head) !== input.expected.versionHash
  )
    return
  let reviewed = head
  if (input.action === 'restore') {
    const historical = await req.payload.findVersions({
      collection: input.collection,
      where: {
        and: [
          { id: { equals: input.restore!.versionID } },
          { parent: { equals: input.documentID } },
        ],
      },
      depth: 0,
      limit: 1,
      overrideAccess: false,
      req,
    })
    reviewed = historical.docs[0]
    if (!reviewed || versionHash(reviewed) !== input.restore!.versionHash) return
  }
  const candidate = reviewed.version as Candidate
  const files = await loadFiles(req, candidate)

  const storage = officialStorage.getOfficialStorage()
  await storage.assertPrivateBucket()
  const verified = new Set<number>()
  for (const { path, identity } of files) {
    if (verified.has(identity.id)) continue
    verified.add(identity.id)
    const release = acquireDocumentSlot()
    try {
      const result = await verifyPDF(await storage.read(identity.storageKey))
      if (result.sha256 !== identity.sha256 || result.size !== identity.size)
        fail(req, [{ path, message: 'The stored PDF does not match its verified record.' }])
    } catch (error) {
      if (error instanceof APIError && (error.status === 413 || error.status === 422))
        fail(req, [{ path, message: 'The stored PDF failed verification.' }])
      throw error
    } finally {
      release()
    }
  }
  proofs.set(req, {
    collection: input.collection,
    documentID: input.documentID,
    action: input.action,
    revision: revisionOf(input),
    files,
    used: false,
  })
}

export function matchesOfficialPreflight(req: PayloadRequest, input: TransitionInput): boolean {
  const proof = proofs.get(req)
  const revision = needsFiles(input) ? revisionOf(input) : undefined
  return (
    !!proof &&
    !proof.used &&
    !!revision &&
    proof.collection === input.collection &&
    proof.documentID === input.documentID &&
    proof.action === input.action &&
    proof.revision.versionID === revision.versionID &&
    proof.revision.versionHash === revision.versionHash
  )
}

/** No-op for non-official publications; otherwise the request proof must match this exact input. */
export function assertOfficialPreflight(req: PayloadRequest, input: TransitionInput): void {
  if (needsFiles(input) && !matchesOfficialPreflight(req, input))
    fail(req, [
      { path: 'mainDocument', message: 'Private document storage verification is required first.' },
    ])
}

export const clearOfficialPreflight = (req: PayloadRequest) => proofs.delete(req)

/** Locked step: database-only recheck of the exact preflighted identities, then single use. */
export async function consumeOfficialPreflight(
  req: PayloadRequest,
  candidate: Candidate,
): Promise<void> {
  const proof = proofs.get(req)
  if (!proof || proof.used)
    fail(req, [
      { path: 'mainDocument', message: 'Private document storage verification is required first.' },
      ...(Array.isArray(candidate.attachments) && candidate.attachments.length
        ? [
            {
              path: 'attachments',
              message: 'Private document storage verification is required first.',
            },
          ]
        : []),
    ])
  const current = await loadFiles(req, candidate)
  const same =
    current.length === proof.files.length &&
    current.every(
      ({ path, identity }, index) =>
        proof.files[index].path === path &&
        (Object.keys(identity) as (keyof FileIdentity)[]).every(
          (key) => proof.files[index].identity[key] === identity[key],
        ),
    )
  if (!same)
    fail(req, [
      {
        path: 'mainDocument',
        message: 'The document files changed after verification. Try again.',
      },
    ])
  proof.used = true
}
