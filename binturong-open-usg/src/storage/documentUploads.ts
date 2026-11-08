import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
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
import { serialID } from '@/jobs/publicationRevision'
import type { Document } from '@/payload-types'
import {
  acquireDocumentSlot,
  MAX_PENDING_UPLOADS_PER_ACTOR,
  UPLOAD_SESSION_TTL_MS,
} from './documentLimits'
import * as officialStorage from './officialStorage'
import { verifyPDF } from './verifyPDF'

export type BeginDocumentUploadInput = {
  organization: number
  originalFilename: string
  previousVersion?: number | null
  requestId: string
  title: string
}

export type BeginDocumentUploadResult =
  | {
      documentID: number
      state: 'pending'
      upload: {
        bucket: string
        endpoint: string
        expiresAt: string
        expiry: string
        path: string
        token: string
      }
    }
  | {
      documentID: number
      state: 'ready'
    }

export type ReadyDocumentMetadata = {
  id: number
  mimeType: 'application/pdf'
  organization: number
  originalFilename: string
  previousVersion: number | null
  sha256: string
  size: number
  state: 'ready'
  title: string
  verifiedAt: string
}

type DocumentWriteGrant = {
  data: Record<string, unknown>
  id?: number
  operation: 'create' | 'update'
  used: boolean
}

const documentGrants = new WeakMap<PayloadRequest, DocumentWriteGrant>()

const ALLOWED_BEGIN_KEYS = new Set([
  'organization',
  'originalFilename',
  'previousVersion',
  'requestId',
  'title',
])

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/

export function consumeDocumentWrite(
  req: PayloadRequest,
  operation: string,
  id: unknown,
  data: unknown,
): boolean {
  const grant = documentGrants.get(req)
  if (
    !grant ||
    grant.used ||
    grant.operation !== operation ||
    !data ||
    typeof data !== 'object' ||
    // Payload's Local API deep-copies data before hooks, so compare content, not identity.
    !isDeepStrictEqual(JSON.parse(JSON.stringify(grant.data)), data) ||
    (operation === 'create' ? id !== undefined : String(grant.id) !== String(id))
  ) {
    return false
  }
  grant.used = true
  return true
}

async function withDocumentWrite<T>(
  req: PayloadRequest,
  grant: Omit<DocumentWriteGrant, 'used'>,
  action: () => Promise<T>,
): Promise<T> {
  documentGrants.set(req, { ...grant, used: false })
  try {
    return await action()
  } finally {
    documentGrants.delete(req)
  }
}

function relationID(value: unknown): number | null {
  if (typeof value === 'number' && serialID(value)) return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' && serialID(id)) return id
  }
  return null
}

function toReadyMetadata(doc: Document): ReadyDocumentMetadata {
  const orgID = relationID(doc.organization)
  if (
    !serialID(Number(doc.id)) ||
    !orgID ||
    doc.state !== 'ready' ||
    !doc.verifiedAt ||
    !doc.storageKey ||
    !doc.sha256 ||
    typeof doc.size !== 'number' ||
    !doc.originalFilename
  ) {
    throw new APIError('Official document is not verified', 409)
  }
  return {
    id: Number(doc.id),
    mimeType: 'application/pdf',
    organization: orgID,
    originalFilename: doc.originalFilename,
    previousVersion: relationID(doc.previousVersion),
    sha256: doc.sha256,
    size: Number(doc.size),
    state: 'ready',
    title: doc.title,
    verifiedAt: doc.verifiedAt,
  }
}

function validateBeginInput(input: unknown): {
  organization: number
  originalFilename: string
  previousVersion: number | null
  requestId: string
  title: string
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new APIError('Enter valid official document upload details', 400)
  }
  const record = input as Record<string, unknown>
  if (Object.keys(record).some((key) => !ALLOWED_BEGIN_KEYS.has(key))) {
    throw new APIError('Enter valid official document upload details', 400)
  }
  if (typeof record.title !== 'string' || CONTROL_CHAR_PATTERN.test(record.title)) {
    throw new APIError('Enter a valid official document title', 400)
  }
  const title = record.title.trim()
  if (!title || title.length > 500) {
    throw new APIError('Enter a valid official document title', 400)
  }
  if (!serialID(record.organization)) {
    throw new APIError('Choose a valid organization', 400)
  }
  const organization = record.organization
  let previousVersion: number | null = null
  if (record.previousVersion !== undefined && record.previousVersion !== null) {
    if (!serialID(record.previousVersion)) {
      throw new APIError('Choose a valid previous document version', 400)
    }
    previousVersion = record.previousVersion
  }
  if (
    typeof record.originalFilename !== 'string' ||
    CONTROL_CHAR_PATTERN.test(record.originalFilename)
  ) {
    throw new APIError('Choose a valid PDF filename', 400)
  }
  const originalFilename = record.originalFilename.trim()
  if (
    originalFilename.length < 5 ||
    originalFilename.length > 255 ||
    originalFilename.includes('/') ||
    originalFilename.includes('\\') ||
    originalFilename.startsWith('.') ||
    originalFilename.endsWith('.') ||
    !/\.pdf$/i.test(originalFilename)
  ) {
    throw new APIError('Choose a PDF filename without path segments', 400)
  }
  if (typeof record.requestId !== 'string' || !UUID_PATTERN.test(record.requestId)) {
    throw new APIError('Provide a valid upload request UUID', 400)
  }
  return {
    organization,
    originalFilename,
    previousVersion,
    requestId: record.requestId.toLowerCase(),
    title,
  }
}

export async function beginDocumentUpload(
  req: PayloadRequest,
  input: BeginDocumentUploadInput,
): Promise<BeginDocumentUploadResult> {
  if (req.transactionID) {
    throw new APIError(
      'Document upload initialization cannot join an open database transaction',
      409,
    )
  }
  const parsed = validateBeginInput(input)
  const storage = officialStorage.getOfficialStorage()

  let documentID = 0
  let stagingKey = ''
  let uploadExpiresAt = ''
  let alreadyReady = false

  const ownsTransaction = await initTransaction(req)
  try {
    await lockAccounts(req)
    const actor = await getActiveAccount(req)
    if (!actor || !hasRole(actor.role, 'editor')) {
      throw new APIError('An active editorial account is required to upload official documents', 403)
    }

    const org = await req.payload.findByID({
      collection: 'organizations',
      id: parsed.organization,
      depth: 0,
      draft: true,
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    if (!org) {
      throw new APIError('Choose an existing organization', 400)
    }

    if (parsed.previousVersion !== null) {
      const previous = await req.payload.findByID({
        collection: 'documents',
        id: parsed.previousVersion,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
        req,
      })
      const prevOrgID = relationID(previous?.organization)
      if (
        !previous ||
        previous.state !== 'ready' ||
        !previous.verifiedAt ||
        !previous.storageKey ||
        !previous.sha256 ||
        typeof previous.size !== 'number' ||
        prevOrgID !== Number(org.id)
      ) {
        throw new APIError(
          'Previous document version must be a verified ready document in the same organization',
          400,
        )
      }
    }

    const uploadRequestId = `${actor.id}:${parsed.requestId}`
    const uploadRequestHash = createHash('sha256')
      .update(
        JSON.stringify({
          organization: parsed.organization,
          originalFilename: parsed.originalFilename,
          previousVersion: parsed.previousVersion,
          title: parsed.title,
        }),
      )
      .digest('hex')

    const existingResult = await req.payload.find({
      collection: 'documents',
      where: { uploadRequestId: { equals: uploadRequestId } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
    })
    const existing = existingResult.docs[0]

    if (existing) {
      if (
        Number(existing.uploadActor) !== Number(actor.id) ||
        existing.uploadRequestHash !== uploadRequestHash
      ) {
        throw new APIError(
          'Upload request ID is already bound to different document metadata',
          409,
        )
      }
      if (existing.state === 'failed') {
        throw new APIError(
          'This upload session failed verification; start a new upload request',
          409,
        )
      }
      if (existing.state === 'ready') {
        toReadyMetadata(existing)
        documentID = Number(existing.id)
        alreadyReady = true
      } else {
        const expiresMs = existing.uploadExpiresAt ? Date.parse(existing.uploadExpiresAt) : NaN
        if (!Number.isFinite(expiresMs) || expiresMs <= Date.now() || !existing.stagingKey) {
          throw new APIError('This upload session has expired; start a new upload request', 409)
        }
        documentID = Number(existing.id)
        stagingKey = existing.stagingKey
        uploadExpiresAt = existing.uploadExpiresAt!
      }
    } else {
      const nowISO = new Date().toISOString()
      const activePending = await req.payload.count({
        collection: 'documents',
        where: {
          and: [
            { uploadActor: { equals: actor.id } },
            { state: { equals: 'pending' } },
            { uploadExpiresAt: { greater_than: nowISO } },
          ],
        },
        overrideAccess: true,
        req,
      })
      if (activePending.totalDocs >= MAX_PENDING_UPLOADS_PER_ACTOR) {
        throw new APIError(
          'You already have the maximum number of active pending document uploads',
          429,
        )
      }

      uploadExpiresAt = new Date(Date.now() + UPLOAD_SESSION_TTL_MS).toISOString()
      stagingKey = `pending/${randomUUID()}.pdf`
      const storageKey = `ready/${randomUUID()}.pdf`
      const createData: Record<string, unknown> = {
        organization: parsed.organization,
        originalFilename: parsed.originalFilename,
        previousVersion: parsed.previousVersion,
        stagingKey,
        state: 'pending',
        storageKey,
        title: parsed.title,
        uploadActor: actor.id,
        uploadExpiresAt,
        uploadRequestHash,
        uploadRequestId,
      }
      const created = await withDocumentWrite(
        req,
        { data: createData, operation: 'create' },
        () =>
          req.payload.create({
            collection: 'documents',
            data: createData as never,
            depth: 0,
            overrideAccess: true,
            req,
          }),
      )
      documentID = Number(created.id)
    }

    if (ownsTransaction) await commitTransaction(req)
  } catch (error) {
    if (ownsTransaction) await killTransaction(req)
    throw error
  }

  if (alreadyReady) {
    return {
      documentID,
      state: 'ready',
    }
  }

  await storage.assertPrivateBucket()
  const token = await storage.createUploadToken(stagingKey)
  return {
    documentID,
    state: 'pending',
    upload: {
      bucket: storage.bucket,
      endpoint: storage.uploadEndpoint,
      expiresAt: uploadExpiresAt,
      expiry: uploadExpiresAt,
      path: stagingKey,
      token,
    },
  }
}

export async function finalizeDocumentUpload(
  req: PayloadRequest,
  documentID: number,
): Promise<ReadyDocumentMetadata> {
  if (req.transactionID) {
    throw new APIError('Document finalization cannot join an open database transaction', 409)
  }
  if (!serialID(documentID)) {
    throw new APIError('Choose a valid official document', 400)
  }
  const storage = officialStorage.getOfficialStorage()

  let actorID = 0
  let stagingKey = ''
  let storageKey = ''
  let existingReady: ReadyDocumentMetadata | null = null

  const ownsPhase1 = await initTransaction(req)
  try {
    await lockAccounts(req)
    const actor = await getActiveAccount(req)
    if (!actor || !hasRole(actor.role, 'editor')) {
      throw new APIError(
        'An active editorial account is required to finalize official documents',
        403,
      )
    }
    actorID = Number(actor.id)

    const doc = await req.payload.findByID({
      collection: 'documents',
      id: documentID,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    if (!doc) {
      throw new APIError('Official document upload session was not found', 404)
    }
    if (!doc.uploadActor || Number(doc.uploadActor) !== actorID) {
      throw new APIError('Only the upload creator may finalize this official document', 403)
    }
    if (doc.state === 'ready') {
      existingReady = toReadyMetadata(doc)
    } else if (doc.state === 'failed') {
      throw new APIError(
        'This upload session failed verification; start a new upload request',
        409,
      )
    } else {
      const expiresMs = doc.uploadExpiresAt ? Date.parse(doc.uploadExpiresAt) : NaN
      if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
        throw new APIError('This upload session has expired', 409)
      }
      if (!doc.stagingKey || !doc.storageKey) {
        throw new APIError('Official document upload session is incomplete', 409)
      }
      stagingKey = doc.stagingKey
      storageKey = doc.storageKey
    }

    if (ownsPhase1) await commitTransaction(req)
  } catch (error) {
    if (ownsPhase1) await killTransaction(req)
    throw error
  }

  if (existingReady) return existingReady

  let canonicalVerified: Awaited<ReturnType<typeof verifyPDF>> | null = null
  let deterministicFailure: APIError | null = null

  const releaseSlot = acquireDocumentSlot()
  try {
    await storage.assertPrivateBucket()

    let stagingBytes: Uint8Array | null = null
    let stagingVerified: Awaited<ReturnType<typeof verifyPDF>> | null = null
    let stagingReadError: unknown = null

    try {
      stagingBytes = await storage.read(stagingKey)
      stagingVerified = await verifyPDF(stagingBytes)
    } catch (error) {
      if (error instanceof APIError && (error.status === 413 || error.status === 422)) {
        deterministicFailure = error
      } else {
        stagingReadError = error
      }
    }

    if (stagingBytes && stagingVerified) {
      const created = await storage.writeVerified(storageKey, stagingBytes)
      const storedBytes = await storage.read(storageKey)
      let storedVerified: Awaited<ReturnType<typeof verifyPDF>>
      try {
        storedVerified = await verifyPDF(storedBytes)
      } catch {
        throw new APIError('Stored official document failed integrity verification', 502)
      }
      if (
        created &&
        (storedVerified.sha256 !== stagingVerified.sha256 ||
          storedVerified.size !== stagingVerified.size)
      ) {
        throw new APIError('Stored official document failed post-write verification', 502)
      }
      canonicalVerified = storedVerified
    } else {
      let existingBytes: Uint8Array | null = null
      try {
        existingBytes = await storage.read(storageKey)
      } catch {
        existingBytes = null
      }
      if (existingBytes) {
        try {
          canonicalVerified = await verifyPDF(existingBytes)
          deterministicFailure = null
        } catch {
          throw new APIError('Stored official document failed integrity verification', 502)
        }
      } else if (!deterministicFailure) {
        if (stagingReadError) throw stagingReadError
        throw new APIError('Upload the PDF bytes before finalizing this document', 409)
      }
    }
  } finally {
    releaseSlot()
  }

  const ownsPhase3 = await initTransaction(req)
  try {
    await lockAccounts(req)
    const currentActor = await getActiveAccount(req)
    if (
      !currentActor ||
      !hasRole(currentActor.role, 'editor') ||
      Number(currentActor.id) !== actorID
    ) {
      throw new APIError(
        'An active editorial account is required to finalize official documents',
        403,
      )
    }

    const currentDoc = await req.payload.findByID({
      collection: 'documents',
      id: documentID,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    if (!currentDoc || Number(currentDoc.uploadActor) !== actorID) {
      throw new APIError('Only the upload creator may finalize this official document', 403)
    }

    if (currentDoc.state === 'ready') {
      const readyMeta = toReadyMetadata(currentDoc)
      if (
        canonicalVerified &&
        (readyMeta.sha256 !== canonicalVerified.sha256 || readyMeta.size !== canonicalVerified.size)
      ) {
        throw new APIError('Official document readiness metadata conflict', 409)
      }
      if (ownsPhase3) await commitTransaction(req)
      return readyMeta
    }

    if (currentDoc.state === 'failed') {
      throw new APIError(
        'This upload session failed verification; start a new upload request',
        409,
      )
    }
    if (currentDoc.state !== 'pending') {
      throw new APIError('Official document upload session is not pending', 409)
    }

    const currentExpiresMs = currentDoc.uploadExpiresAt
      ? Date.parse(currentDoc.uploadExpiresAt)
      : NaN
    if (!Number.isFinite(currentExpiresMs) || currentExpiresMs <= Date.now()) {
      throw new APIError('This upload session has expired', 409)
    }

    if (deterministicFailure || !canonicalVerified) {
      const failData: Record<string, unknown> = { state: 'failed' }
      await withDocumentWrite(
        req,
        { data: failData, id: documentID, operation: 'update' },
        () =>
          req.payload.update({
            collection: 'documents',
            id: documentID,
            data: failData as never,
            depth: 0,
            overrideAccess: true,
            req,
          }),
      )
      if (ownsPhase3) await commitTransaction(req)
      throw deterministicFailure ?? new APIError('Official PDF verification failed', 422)
    }

    const readyData: Record<string, unknown> = {
      mimeType: canonicalVerified.mimeType,
      sha256: canonicalVerified.sha256,
      size: canonicalVerified.size,
      state: 'ready',
      verifiedAt: new Date().toISOString(),
    }
    const updated = await withDocumentWrite(
      req,
      { data: readyData, id: documentID, operation: 'update' },
      () =>
        req.payload.update({
          collection: 'documents',
          id: documentID,
          data: readyData as never,
          depth: 0,
          overrideAccess: true,
          req,
        }),
    )
    const result = toReadyMetadata(updated)
    if (ownsPhase3) await commitTransaction(req)
    return result
  } catch (error) {
    if (ownsPhase3 && req.transactionID) await killTransaction(req)
    throw error
  }
}
