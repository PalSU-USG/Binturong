import { createHmac, randomUUID } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { Upload } from 'tus-js-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getOfficialStorage } from '@/storage/officialStorage'
import { TUS_CHUNK_BYTES } from '@/storage/documentLimits'
import { verifyPDF } from '@/storage/verifyPDF'
import { assertTestStorage } from '../helpers/assertTestStorage'

describe('real local private Storage boundary', () => {
  const owned: string[] = []
  let bytes: Uint8Array
  let storage: ReturnType<typeof getOfficialStorage>
  const provider = (path: string, token: string, init: RequestInit = {}) =>
    fetch(`${process.env.OFFICIAL_STORAGE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
  const key = (prefix: string) => {
    const value = `${prefix}/${randomUUID()}.pdf`
    owned.push(value)
    return value
  }
  beforeAll(async () => {
    assertTestStorage(process.env.OFFICIAL_STORAGE_URL, process.env.OFFICIAL_STORAGE_BUCKET)
    storage = getOfficialStorage()
    await storage.assertPrivateBucket()
    const pdf = await PDFDocument.create()
    pdf.addPage()
    bytes = await pdf.save()
  })
  afterAll(async () => {
    if (!owned.length) return
    assertTestStorage(process.env.OFFICIAL_STORAGE_URL, process.env.OFFICIAL_STORAGE_BUCKET)
    const response = await provider(
      `/object/${storage.bucket}`,
      process.env.OFFICIAL_STORAGE_SERVICE_KEY!,
      {
        method: 'DELETE',
        body: JSON.stringify({ prefixes: owned }),
      },
    )
    expect(response.ok).toBe(true)
  })

  it('uploads through a signed TUS capability and preserves exact immutable ready bytes', async () => {
    const pending = key('pending')
    const token = await storage.createUploadToken(pending)
    await new Promise<void>((resolve, reject) => {
      new Upload(Buffer.from(bytes), {
        endpoint: storage.uploadEndpoint,
        headers: { 'x-signature': token, 'x-upsert': 'false' },
        chunkSize: TUS_CHUNK_BYTES,
        uploadDataDuringCreation: true,
        retryDelays: null,
        storeFingerprintForResuming: false,
        metadata: {
          bucketName: storage.bucket,
          objectName: pending,
          contentType: 'application/pdf',
          cacheControl: '0',
        },
        onError: reject,
        onSuccess: () => resolve(),
      }).start()
    })
    const staged = await storage.read(pending)
    expect(staged).toEqual(Buffer.from(bytes))
    expect(await verifyPDF(staged)).toEqual(await verifyPDF(bytes))
    const ready = key('ready')
    expect(await storage.writeVerified(ready, staged)).toBe(true)
    expect(await storage.writeVerified(ready, new Uint8Array([1, 2, 3]))).toBe(false)
    expect(await storage.read(ready)).toEqual(Buffer.from(bytes))
    const readWithUploadToken = await provider(
      `/object/authenticated/${storage.bucket}/${pending}`,
      token,
    )
    expect(readWithUploadToken.ok).toBe(false)
  }, 60_000)

  it('denies actual anonymous and authenticated provider roles read, write, delete and list visibility', async () => {
    const ready = key('ready')
    expect(await storage.writeVerified(ready, bytes)).toBe(true)
    const secret = process.env.OFFICIAL_STORAGE_TEST_JWT_SECRET
    expect(secret).toBeTruthy()
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const claims = Buffer.from(
      JSON.stringify({
        role: 'authenticated',
        aud: 'authenticated',
        sub: randomUUID(),
        exp: Math.floor(Date.now() / 1000) + 120,
      }),
    ).toString('base64url')
    const unsigned = `${header}.${claims}`
    const authenticated = `${unsigned}.${createHmac('sha256', secret!).update(unsigned).digest('base64url')}`
    const publicRead = await provider(
      `/object/public/${storage.bucket}/${ready}`,
      process.env.OFFICIAL_STORAGE_ANON_KEY!,
    )
    expect(publicRead.ok).toBe(false)
    for (const token of [process.env.OFFICIAL_STORAGE_ANON_KEY!, authenticated]) {
      const read = await provider(`/object/authenticated/${storage.bucket}/${ready}`, token)
      expect(read.ok).toBe(false)
      expect(read.status).not.toBe(401)
      const write = await provider(`/object/${storage.bucket}/${key('ready')}`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
        body: bytes,
      })
      expect([400, 403]).toContain(write.status)
      const deniedWrite = await write.json()
      expect(deniedWrite.statusCode).toBe('403')
      expect(deniedWrite.message).toMatch(/row-level security policy/i)
      const remove = await provider(`/object/${storage.bucket}`, token, {
        method: 'DELETE',
        body: JSON.stringify({ prefixes: [ready] }),
      })
      if (remove.ok) expect(await remove.json()).toEqual([])
      else expect(remove.status).not.toBe(401)
      const list = await provider(`/object/list/${storage.bucket}`, token, {
        method: 'POST',
        body: JSON.stringify({ prefix: 'ready', limit: 100, offset: 0 }),
      })
      if (list.ok) expect(await list.json()).toEqual([])
      else expect(list.status).not.toBe(401)
      expect(await storage.read(ready)).toEqual(Buffer.from(bytes))
    }
  }, 60_000)
})
