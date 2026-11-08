import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { Upload } from 'tus-js-client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, handleEndpoints, type Payload } from 'payload'
import { withAccountProvisioning } from '@/collections/Users/accountProvisioning'
import { GRAPHQL_POST } from '@payloadcms/next/routes'

import config from '@/payload.config'
import type { UserRole } from '@/access/roles'
import { TUS_CHUNK_BYTES } from '@/storage/documentLimits'
import * as officialStorage from '@/storage/officialStorage'
import {
  beginDocumentUpload,
  consumeDocumentWrite,
  finalizeDocumentUpload,
} from '@/storage/documentUploads'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import { assertTestStorage } from '../helpers/assertTestStorage'

const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function buildSyntheticPDFBytes(title: string, targetMinBytes = 4096): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  const page = pdf.addPage([612, 792])
  page.drawText(`${title} - ${' Official USG Record '.repeat(Math.ceil(targetMinBytes / 512))}`)
  return pdf.save()
}

async function uploadBytesViaTus(options: {
  bucket: string
  bytes: Uint8Array
  endpoint: string
  path: string
  token: string
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    new Upload(Buffer.from(options.bytes), {
      endpoint: options.endpoint,
      headers: { 'x-signature': options.token, 'x-upsert': 'false' },
      chunkSize: TUS_CHUNK_BYTES,
      uploadDataDuringCreation: true,
      retryDelays: null,
      storeFingerprintForResuming: false,
      metadata: {
        bucketName: options.bucket,
        objectName: options.path,
        contentType: 'application/pdf',
        cacheControl: '0',
      },
      onError: reject,
      onSuccess: () => resolve(),
    }).start()
  })
}

describe('official document upload sessions and immutable readiness', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const createdOrgs: number[] = []
  const createdDocs: number[] = []
  const ownedStorageKeys: string[] = []

  const actor = (role: UserRole = 'editor') => ({
    ...fixtures.users[role],
    collection: 'users' as const,
  })

  beforeAll(async () => {
    assertTestStorage(process.env.OFFICIAL_STORAGE_URL, process.env.OFFICIAL_STORAGE_BUCKET)
    await officialStorage.getOfficialStorage().assertPrivateBucket()
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    for (const id of createdDocs) {
      const doc = await payload.findByID({
        collection: 'documents',
        id,
        overrideAccess: true,
        disableErrors: true,
      })
      if (doc?.stagingKey) ownedStorageKeys.push(doc.stagingKey)
      if (doc?.storageKey) ownedStorageKeys.push(doc.storageKey)
    }
    if (ownedStorageKeys.length) {
      assertTestStorage(process.env.OFFICIAL_STORAGE_URL, process.env.OFFICIAL_STORAGE_BUCKET)
      await fetch(`${process.env.OFFICIAL_STORAGE_URL}/object/${process.env.OFFICIAL_STORAGE_BUCKET}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${process.env.OFFICIAL_STORAGE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes: [...new Set(ownedStorageKeys)] }),
      }).catch(() => undefined)
    }
    for (const id of createdDocs.reverse()) {
      await payload.db.deleteOne({ collection: 'documents', where: { id: { equals: id } } })
    }
    for (const id of createdOrgs.reverse()) {
      await payload.db.deleteVersions({
        collection: 'organizations',
        where: { parent: { equals: id } },
      })
      await payload.db.deleteOne({ collection: 'organizations', where: { id: { equals: id } } })
    }
    if (fixtures) {
      await removeTestAccounts(
        payload,
        Object.values(fixtures.users).map(({ id }) => id),
      )
    }
  })

  async function createOrganization(name = `Synthetic upload org ${randomUUID()}`) {
    const org = await payload.create({
      collection: 'organizations',
      draft: true,
      overrideAccess: false,
      user: actor('editor'),
      data: { name, kind: 'usg' },
    })
    createdOrgs.push(org.id)
    return org
  }

  function request(path: string, role?: UserRole, body?: unknown, method = 'POST') {
    return handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api/documents${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(role ? { Authorization: `JWT ${fixtures.tokens[role]}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    })
  }

  it('denies_native_document_crud_forged_ready_writes_and_unregistered_internal_grants', async () => {
    const org = await createOrganization()
    const seeded = await payload.db.create({
      collection: 'documents',
      data: {
        organization: org.id,
        title: `Synthetic sealed row ${randomUUID()}`,
        state: 'pending',
      },
    })
    createdDocs.push(seeded.id)

    for (const role of ['editor', 'publisher', 'admin', 'super_admin'] as const) {
      for (const overrideAccess of [false, true]) {
        await expect(
          payload.create({
            collection: 'documents',
            overrideAccess,
            user: actor(role),
            data: {
              organization: org.id,
              title: 'Forged ready document',
              state: 'ready',
              storageKey: `ready/${randomUUID()}.pdf`,
              sha256: 'a'.repeat(64),
              size: 1024,
            },
          }),
        ).rejects.toMatchObject({ status: 403 })

        await expect(
          payload.update({
            collection: 'documents',
            id: seeded.id,
            overrideAccess,
            user: actor(role),
            data: {
              state: 'ready',
              storageKey: `ready/${randomUUID()}.pdf`,
            },
          }),
        ).rejects.toMatchObject({ status: 403 })

        await expect(
          payload.delete({
            collection: 'documents',
            id: seeded.id,
            overrideAccess,
            user: actor(role),
          }),
        ).rejects.toMatchObject({ status: 403 })
      }
    }

    expect(
      (
        await request(
          '',
          'super_admin',
          {
            organization: org.id,
            title: 'Forged REST create',
            state: 'ready',
          },
          'POST',
        )
      ).status,
    ).toBe(403)
    expect(
      (await request(`/${seeded.id}`, 'super_admin', { state: 'ready' }, 'PATCH')).status,
    ).toBe(403)
    expect((await request(`/${seeded.id}`, 'super_admin', undefined, 'DELETE')).status).toBe(403)

    const req = await createLocalReq({ user: actor('super_admin') }, payload)
    expect(consumeDocumentWrite(req, 'create', undefined, { title: 'Unregistered' })).toBe(false)
    expect(consumeDocumentWrite(req, 'update', seeded.id, { state: 'ready' })).toBe(false)
  })

  it('rejects_unauthenticated_or_disabled_actors_and_malformed_upload_initialization_inputs', async () => {
    const org = await createOrganization()
    const otherOrg = await createOrganization()
    const validInput = {
      title: 'Synthetic Official Constitution',
      organization: org.id,
      originalFilename: 'constitution-2026.pdf',
      requestId: randomUUID(),
    }

    expect((await request('/begin-upload', undefined, validInput)).status).toBe(403)

    const accountReq = await createLocalReq({}, payload)
    const disabledUser = await withAccountProvisioning(accountReq, () =>
      payload.create({
        collection: 'users',
        req: accountReq,
        data: {
          email: `synthetic-disabled-${randomUUID()}@example.invalid`,
          password: 'synthetic-disabled-password',
          name: 'Synthetic disabled editor',
          role: 'editor',
          disabled: true,
          authRevision: 0,
        },
      }),
    )
    try {
      const disabledReq = await createLocalReq(
        { user: { ...disabledUser, collection: 'users' as const } },
        payload,
      )
      await expect(beginDocumentUpload(disabledReq, validInput)).rejects.toMatchObject({
        status: 403,
      })
    } finally {
      await removeTestAccounts(payload, [disabledUser.id])
    }

    const editorReq = await createLocalReq({ user: actor('editor') }, payload)
    for (const invalid of [
      null,
      [],
      'invalid',
      { ...validInput, title: '   ' },
      { ...validInput, title: 'Bad\u0000Title' },
      { ...validInput, organization: 0 },
      { ...validInput, organization: -1 },
      { ...validInput, organization: 1.5 },
      { ...validInput, organization: '1' },
      { ...validInput, organization: Number.MAX_SAFE_INTEGER },
      { ...validInput, organization: 2147483647 },
      { ...validInput, originalFilename: '' },
      { ...validInput, originalFilename: 'notes.txt' },
      { ...validInput, originalFilename: '.pdf' },
      { ...validInput, originalFilename: '../secret.pdf' },
      { ...validInput, originalFilename: 'nested/secret.pdf' },
      { ...validInput, originalFilename: 'nested\\secret.pdf' },
      { ...validInput, originalFilename: 'bad\u0000name.pdf' },
      { ...validInput, requestId: 'not-a-uuid' },
      { ...validInput, requestId: '' },
      { ...validInput, previousVersion: 0 },
      { ...validInput, previousVersion: '1' },
      { ...validInput, previousVersion: 2147483647 },
      { ...validInput, state: 'ready' },
      { ...validInput, storageKey: `ready/${randomUUID()}.pdf` },
      { ...validInput, sha256: '0'.repeat(64) },
      { ...validInput, verifiedAt: new Date().toISOString() },
    ]) {
      await expect(
        beginDocumentUpload(editorReq, invalid as Parameters<typeof beginDocumentUpload>[1]),
      ).rejects.toMatchObject({ status: 400 })
    }

    const legacyUnverifiedReady = await payload.db.create({
      collection: 'documents',
      data: {
        organization: org.id,
        title: 'Legacy unverified ready row',
        state: 'ready',
        storageKey: `ready/${randomUUID()}.pdf`,
        sha256: 'b'.repeat(64),
        size: 512,
      },
    })
    createdDocs.push(legacyUnverifiedReady.id)

    await expect(
      beginDocumentUpload(editorReq, {
        ...validInput,
        previousVersion: legacyUnverifiedReady.id,
      }),
    ).rejects.toMatchObject({ status: 400 })

    const wrongOrgReady = await payload.db.create({
      collection: 'documents',
      data: {
        organization: otherOrg.id,
        title: 'Other org verified ready row',
        state: 'ready',
        storageKey: `ready/${randomUUID()}.pdf`,
        sha256: 'c'.repeat(64),
        size: 512,
        verifiedAt: new Date().toISOString(),
      },
    })
    createdDocs.push(wrongOrgReady.id)

    await expect(
      beginDocumentUpload(editorReq, {
        ...validInput,
        previousVersion: wrongOrgReady.id,
      }),
    ).rejects.toMatchObject({ status: 400 })

    for (const invalidId of ['0', '-5', '1.5', 'abc', '9007199254740991']) {
      expect((await request(`/${invalidId}/finalize`, 'editor')).status).toBe(400)
    }
  })

  it('enforces_idempotent_request_identity_conflict_detection_and_per_actor_pending_quota', async () => {
    const org = await createOrganization()
    const requestId = randomUUID().toUpperCase()
    const baseInput = {
      title: 'Synthetic Budget Report FY2026',
      organization: org.id,
      originalFilename: 'budget-fy2026.pdf',
      requestId,
    }

    const firstRes = await request('/begin-upload', 'editor', baseInput)
    expect(firstRes.status).toBe(200)
    const first = await firstRes.json()
    createdDocs.push(first.documentID)
    expect(first).toMatchObject({
      documentID: expect.any(Number),
      state: 'pending',
      upload: {
        bucket: process.env.OFFICIAL_STORAGE_BUCKET,
        endpoint: expect.stringContaining('/upload/resumable/sign'),
        path: expect.stringMatching(/^pending\/[a-f0-9-]{36}\.pdf$/),
        token: expect.any(String),
        expiry: expect.any(String),
      },
    })

    // Exact replay with lowercase UUID returns the exact same pending session
    const replayRes = await request('/begin-upload', 'editor', {
      ...baseInput,
      requestId: requestId.toLowerCase(),
    })
    expect(replayRes.status).toBe(200)
    const replay = await replayRes.json()
    expect(replay.documentID).toBe(first.documentID)
    expect(replay.upload.path).toBe(first.upload.path)

    // Same actor + requestId with modified payload is rejected with 409
    expect(
      (
        await request('/begin-upload', 'editor', {
          ...baseInput,
          title: 'Modified Title With Same Request ID',
        })
      ).status,
    ).toBe(409)
    expect(
      (
        await request('/begin-upload', 'editor', {
          ...baseInput,
          originalFilename: 'different-file.pdf',
        })
      ).status,
    ).toBe(409)

    // Different actor with the same UUID gets an independent session
    const publisherRes = await request('/begin-upload', 'publisher', baseInput)
    expect(publisherRes.status).toBe(200)
    const publisherSession = await publisherRes.json()
    createdDocs.push(publisherSession.documentID)
    expect(publisherSession.documentID).not.toBe(first.documentID)

    // Fill the editor's remaining 9 active pending slots (total 10 active pending sessions)
    for (let index = 1; index < 10; index++) {
      const res = await request('/begin-upload', 'editor', {
        title: `Synthetic Quota Document ${index}`,
        organization: org.id,
        originalFilename: `quota-${index}.pdf`,
        requestId: randomUUID(),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      createdDocs.push(body.documentID)
    }

    // 11th active pending session is rejected with 429
    const eleventh = await request('/begin-upload', 'editor', {
      title: 'Synthetic Quota Overflow Document',
      organization: org.id,
      originalFilename: 'quota-overflow.pdf',
      requestId: randomUUID(),
    })
    expect(eleventh.status).toBe(429)

    // Expire the first pending session: repeating its requestId fails with 409,
    // and its slot is freed so a new requestId succeeds
    await payload.db.pool.query(
      'update documents set upload_expires_at = $1 where id = $2',
      [new Date(Date.now() - 60_000).toISOString(), first.documentID],
    )
    expect((await request('/begin-upload', 'editor', baseInput)).status).toBe(409)

    const freedSlot = await request('/begin-upload', 'editor', {
      title: 'Synthetic Freed Quota Slot',
      organization: org.id,
      originalFilename: 'freed-slot.pdf',
      requestId: randomUUID(),
    })
    expect(freedSlot.status).toBe(200)
    const freedBody = await freedSlot.json()
    createdDocs.push(freedBody.documentID)
  })

  it('verifies_uploaded_pdf_commits_immutable_ready_metadata_and_hides_storage_keys_in_api', async () => {
    const org = await createOrganization()
    const requestId = randomUUID()
    const pdfBytes = await buildSyntheticPDFBytes('Official Audit Report 2026', 64 * 1024)
    const expectedHash = sha256Hex(pdfBytes)

    const beginRes = await request('/begin-upload', 'admin', {
      title: 'Official Audit Report 2026',
      organization: org.id,
      originalFilename: 'audit-report-2026.pdf',
      requestId,
    })
    expect(beginRes.status).toBe(200)
    const session = await beginRes.json()
    createdDocs.push(session.documentID)

    // Finalizing before uploading bytes fails with 503/409 and keeps session pending
    const premature = await request(`/${session.documentID}/finalize`, 'admin')
    expect(premature.ok).toBe(false)

    await uploadBytesViaTus({
      bucket: session.upload.bucket,
      bytes: pdfBytes,
      endpoint: session.upload.endpoint,
      path: session.upload.path,
      token: session.upload.token,
    })

    const finalizeRes = await request(`/${session.documentID}/finalize`, 'admin')
    expect(finalizeRes.status).toBe(200)
    const readyDoc = await finalizeRes.json()
    expect(readyDoc).toMatchObject({
      id: session.documentID,
      title: 'Official Audit Report 2026',
      organization: org.id,
      originalFilename: 'audit-report-2026.pdf',
      mimeType: 'application/pdf',
      size: pdfBytes.byteLength,
      sha256: expectedHash,
      state: 'ready',
      previousVersion: null,
      verifiedAt: expect.any(String),
    })
    expect(readyDoc).not.toHaveProperty('storageKey')
    expect(readyDoc).not.toHaveProperty('stagingKey')
    expect(readyDoc).not.toHaveProperty('uploadRequestId')

    // Exact retries of finalize and begin-upload are idempotent for the creator
    const finalizeRetry = await request(`/${session.documentID}/finalize`, 'admin')
    expect(finalizeRetry.status).toBe(200)
    expect(await finalizeRetry.json()).toEqual(readyDoc)

    const beginRetry = await request('/begin-upload', 'admin', {
      title: 'Official Audit Report 2026',
      organization: org.id,
      originalFilename: 'audit-report-2026.pdf',
      requestId,
    })
    expect(beginRetry.status).toBe(200)
    expect(await beginRetry.json()).toEqual({
      documentID: session.documentID,
      state: 'ready',
    })

    // Replacement version links previousVersion to the verified ready document
    const replacementBytes = await buildSyntheticPDFBytes('Amended Audit Report 2026', 48 * 1024)
    const replacementBegin = await request('/begin-upload', 'admin', {
      title: 'Amended Audit Report 2026',
      organization: org.id,
      originalFilename: 'audit-report-2026-v2.pdf',
      previousVersion: session.documentID,
      requestId: randomUUID(),
    })
    expect(replacementBegin.status).toBe(200)
    const replacementSession = await replacementBegin.json()
    createdDocs.push(replacementSession.documentID)

    await uploadBytesViaTus({
      bucket: replacementSession.upload.bucket,
      bytes: replacementBytes,
      endpoint: replacementSession.upload.endpoint,
      path: replacementSession.upload.path,
      token: replacementSession.upload.token,
    })
    const replacementFinalize = await request(`/${replacementSession.documentID}/finalize`, 'admin')
    expect(replacementFinalize.status).toBe(200)
    expect(await replacementFinalize.json()).toMatchObject({
      id: replacementSession.documentID,
      previousVersion: session.documentID,
      sha256: sha256Hex(replacementBytes),
      size: replacementBytes.byteLength,
      state: 'ready',
    })

    // Non-privileged API and GraphQL reads never leak storageKey or upload session fields
    const restRead = await request(`/${session.documentID}`, 'admin', undefined, 'GET')
    expect(restRead.status).toBe(200)
    const restBody = await restRead.json()
    expect(restBody.storageKey).toBeUndefined()
    expect(restBody.stagingKey).toBeUndefined()
    expect(restBody.uploadRequestId).toBeUndefined()
    expect(restBody.sha256).toBe(expectedHash)

    const gqlRes = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.admin}`,
        },
        body: JSON.stringify({
          query: `{ Documents(where: { id: { equals: ${session.documentID} } }) { docs { id storageKey sha256 state verifiedAt } } }`,
        }),
      }),
    )
    const gqlJson = await gqlRes.json()
    expect(gqlJson.errors).toBeUndefined()
    expect(gqlJson.data.Documents.docs[0]).toEqual({
      id: session.documentID,
      storageKey: null,
      sha256: expectedHash,
      state: 'ready',
      verifiedAt: readyDoc.verifiedAt,
    })

    // Internal privileged read still has storageKey and stored bytes match original synthetic bytes
    const internalDoc = await payload.findByID({
      collection: 'documents',
      id: session.documentID,
      overrideAccess: true,
    })
    expect(internalDoc.storageKey).toMatch(/^ready\/[a-f0-9-]{36}\.pdf$/)
    const storedBytes = await officialStorage.getOfficialStorage().read(internalDoc.storageKey!)
    expect(Buffer.compare(Buffer.from(storedBytes), Buffer.from(pdfBytes))).toBe(0)
  })

  it('denies_finalization_by_other_actors_or_when_revoked_or_expired_during_verification', async () => {
    const org = await createOrganization()
    const pdfBytes = await buildSyntheticPDFBytes('Barrier Verification PDF', 32 * 1024)

    // 1. Actor mismatch denied (403)
    const beginRes = await request('/begin-upload', 'publisher', {
      title: 'Publisher Owned Upload',
      organization: org.id,
      originalFilename: 'publisher-upload.pdf',
      requestId: randomUUID(),
    })
    const session = await beginRes.json()
    createdDocs.push(session.documentID)
    await uploadBytesViaTus({
      bucket: session.upload.bucket,
      bytes: pdfBytes,
      endpoint: session.upload.endpoint,
      path: session.upload.path,
      token: session.upload.token,
    })
    expect((await request(`/${session.documentID}/finalize`, 'super_admin')).status).toBe(403)

    // 2. Actor disabled during Phase 2 verification (after ready object write, before Phase 3 commit)
    const realStorage = officialStorage.getOfficialStorage()
    const getStorageSpy = vi.spyOn(officialStorage, 'getOfficialStorage').mockImplementation(() => ({
      ...realStorage,
      async writeVerified(key, bytes) {
        const result = await realStorage.writeVerified(key, bytes)
        await payload.update({
          collection: 'users',
          id: fixtures.users.publisher.id,
          overrideAccess: false,
          user: actor('super_admin'),
          data: { disabled: true },
        })
        return result
      },
    }))

    try {
      const req = await createLocalReq({ user: actor('publisher') }, payload)
      await expect(finalizeDocumentUpload(req, session.documentID)).rejects.toMatchObject({
        status: 403,
      })
    } finally {
      getStorageSpy.mockRestore()
      await payload.update({
        collection: 'users',
        id: fixtures.users.publisher.id,
        overrideAccess: false,
        user: actor('super_admin'),
        data: { disabled: false },
      })
      const relogin = await payload.login({
        collection: 'users',
        data: { email: fixtures.users.publisher.email, password: 'synthetic-access-password' },
      })
      fixtures.tokens.publisher = relogin.token!
    }

    const afterRevoke = await payload.findByID({
      collection: 'documents',
      id: session.documentID,
      overrideAccess: true,
    })
    expect(afterRevoke.state).toBe('pending')
    expect(afterRevoke.verifiedAt).toBeNull()

    // 3. Session expired after ready object write, before Phase 3 commit recheck
    const expireSessionRes = await request('/begin-upload', 'publisher', {
      title: 'Expiring During Verification PDF',
      organization: org.id,
      originalFilename: 'expiring-during-verify.pdf',
      requestId: randomUUID(),
    })
    const expireSession = await expireSessionRes.json()
    createdDocs.push(expireSession.documentID)
    await uploadBytesViaTus({
      bucket: expireSession.upload.bucket,
      bytes: pdfBytes,
      endpoint: expireSession.upload.endpoint,
      path: expireSession.upload.path,
      token: expireSession.upload.token,
    })

    const expireSpy = vi.spyOn(officialStorage, 'getOfficialStorage').mockImplementation(() => ({
      ...realStorage,
      async writeVerified(key, bytes) {
        const result = await realStorage.writeVerified(key, bytes)
        await payload.db.pool.query(
          'update documents set upload_expires_at = $1 where id = $2',
          [new Date(Date.now() - 5_000).toISOString(), expireSession.documentID],
        )
        return result
      },
    }))
    try {
      const req = await createLocalReq({ user: actor('publisher') }, payload)
      await expect(finalizeDocumentUpload(req, expireSession.documentID)).rejects.toMatchObject({
        status: 409,
      })
    } finally {
      expireSpy.mockRestore()
    }

    const afterExpire = await payload.findByID({
      collection: 'documents',
      id: expireSession.documentID,
      overrideAccess: true,
    })
    expect(afterExpire.state).toBe('pending')
    expect(afterExpire.verifiedAt).toBeNull()
  })

  it('recovers_canonical_ready_bytes_across_interrupted_db_commit_and_competing_finalizers_and_marks_invalid_pdfs_failed', async () => {
    const org = await createOrganization()

    // 1. Deterministically invalid PDF transitions session to failed (422)
    const invalidRequestId = randomUUID()
    const invalidBeginRes = await request('/begin-upload', 'super_admin', {
      title: 'Corrupt Upload PDF',
      organization: org.id,
      originalFilename: 'corrupt.pdf',
      requestId: invalidRequestId,
    })
    const invalidSession = await invalidBeginRes.json()
    createdDocs.push(invalidSession.documentID)

    await uploadBytesViaTus({
      bucket: invalidSession.upload.bucket,
      bytes: new TextEncoder().encode('%PDF-1.7 corrupt bytes without trailer'),
      endpoint: invalidSession.upload.endpoint,
      path: invalidSession.upload.path,
      token: invalidSession.upload.token,
    })

    expect((await request(`/${invalidSession.documentID}/finalize`, 'super_admin')).status).toBe(
      422,
    )
    const failedDoc = await payload.findByID({
      collection: 'documents',
      id: invalidSession.documentID,
      overrideAccess: true,
    })
    expect(failedDoc.state).toBe('failed')
    expect((await request(`/${invalidSession.documentID}/finalize`, 'super_admin')).status).toBe(
      409,
    )
    expect(
      (
        await request('/begin-upload', 'super_admin', {
          title: 'Corrupt Upload PDF',
          organization: org.id,
          originalFilename: 'corrupt.pdf',
          requestId: invalidRequestId,
        })
      ).status,
    ).toBe(409)

    // 2. Interrupted DB commit after ready object write + competing staging bytes & concurrent finalizers
    const canonicalBytes = await buildSyntheticPDFBytes('Canonical First Ready PDF', 40 * 1024)
    const competingBytes = await buildSyntheticPDFBytes('Competing Staging PDF', 56 * 1024)
    const canonicalHash = sha256Hex(canonicalBytes)
    expect(canonicalHash).not.toBe(sha256Hex(competingBytes))

    const recoverBeginRes = await request('/begin-upload', 'super_admin', {
      title: 'Recoverable Canonical PDF',
      organization: org.id,
      originalFilename: 'recoverable.pdf',
      requestId: randomUUID(),
    })
    const recoverSession = await recoverBeginRes.json()
    createdDocs.push(recoverSession.documentID)

    await uploadBytesViaTus({
      bucket: recoverSession.upload.bucket,
      bytes: canonicalBytes,
      endpoint: recoverSession.upload.endpoint,
      path: recoverSession.upload.path,
      token: recoverSession.upload.token,
    })

    // Simulate DB update failure on the first finalization AFTER ready object is written
    const originalUpdate = payload.update.bind(payload)
    let failedOnce = false
    const updateSpy = vi
      .spyOn(payload, 'update')
      .mockImplementation((async (args: Parameters<typeof payload.update>[0]) => {
        if (!failedOnce && args.collection === 'documents') {
          failedOnce = true
          throw new Error('Simulated DB commit failure after ready object write')
        }
        return originalUpdate(args)
      }) as typeof payload.update)

    try {
      const req1 = await createLocalReq({ user: actor('super_admin') }, payload)
      await expect(finalizeDocumentUpload(req1, recoverSession.documentID)).rejects.toThrow(
        /Simulated DB commit failure after ready object write/,
      )
    } finally {
      updateSpy.mockRestore()
    }

    const stillPending = await payload.findByID({
      collection: 'documents',
      id: recoverSession.documentID,
      overrideAccess: true,
    })
    expect(stillPending.state).toBe('pending')

    // Now simulate a competing staging read returning `competingBytes` while two finalizers race
    const realStorage = officialStorage.getOfficialStorage()
    const competingStagingSpy = vi
      .spyOn(officialStorage, 'getOfficialStorage')
      .mockImplementation(() => ({
        ...realStorage,
        async read(key: string) {
          if (key === stillPending.stagingKey) {
            return competingBytes
          }
          return realStorage.read(key)
        },
      }))

    try {
      const reqA = await createLocalReq({ user: actor('super_admin') }, payload)
      const reqB = await createLocalReq({ user: actor('super_admin') }, payload)
      const [resultA, resultB] = await Promise.all([
        finalizeDocumentUpload(reqA, recoverSession.documentID),
        finalizeDocumentUpload(reqB, recoverSession.documentID),
      ])

      expect(resultA).toEqual(resultB)
      expect(resultA).toMatchObject({
        id: recoverSession.documentID,
        sha256: canonicalHash,
        size: canonicalBytes.byteLength,
        state: 'ready',
      })
    } finally {
      competingStagingSpy.mockRestore()
    }

    const recoveredDoc = await payload.findByID({
      collection: 'documents',
      id: recoverSession.documentID,
      overrideAccess: true,
    })
    expect(recoveredDoc.state).toBe('ready')
    expect(recoveredDoc.sha256).toBe(canonicalHash)
    expect(recoveredDoc.size).toBe(canonicalBytes.byteLength)
    const readyBytes = await realStorage.read(recoveredDoc.storageKey!)
    expect(Buffer.compare(Buffer.from(readyBytes), Buffer.from(canonicalBytes))).toBe(0)
  })
})
