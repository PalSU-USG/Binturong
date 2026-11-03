import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getOfficialStorage } from '@/storage/officialStorage'
import {
  acquireDocumentSlot,
  MAX_DOCUMENT_BYTES,
  PDF_WORKER_TIMEOUT_MS,
} from '@/storage/documentLimits'
import { verifyPDF } from '@/storage/verifyPDF'
import { assertTestStorage } from '../helpers/assertTestStorage'

const workerControl = vi.hoisted(() => ({ stall: false, terminations: 0 }))
vi.mock('node:worker_threads', async (original) => {
  const actual = await original<typeof import('node:worker_threads')>()
  return {
    ...actual,
    Worker: class extends actual.Worker {
      constructor(filename: string | URL, options?: import('node:worker_threads').WorkerOptions) {
        super(workerControl.stall ? 'setInterval(() => {}, 1000)' : filename, options)
      }
      override terminate() {
        workerControl.terminations++
        return super.terminate()
      }
    },
  }
})

const objectKey = (state: 'pending' | 'ready') => `${state}/${randomUUID()}.pdf`
const privateBucket = {
  public: false,
  file_size_limit: 50_000_000,
  allowed_mime_types: ['application/pdf'],
}

describe('private official storage and PDF verification', () => {
  beforeEach(() => {
    vi.stubEnv('OFFICIAL_STORAGE_URL', 'http://127.0.0.1:56321')
    vi.stubEnv('OFFICIAL_STORAGE_SERVICE_KEY', 'synthetic-storage-service-key')
    vi.stubEnv('OFFICIAL_STORAGE_BUCKET', 'synthetic-documents')
  })
  afterEach(() => {
    vi.useRealTimers()
    workerControl.stall = false
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('isolates live provider fixtures from hosted services and ordinary buckets', () => {
    expect(() =>
      assertTestStorage('http://127.0.0.1:56321', 'binturong-documents-test'),
    ).not.toThrow()
    for (const [url, bucket] of [
      ['https://example.supabase.co/storage/v1', 'binturong-documents-test'],
      ['http://127.0.0.1:56321', 'official-documents'],
      ['http://127.0.0.1:55321', 'binturong-documents-test'],
      ['http://127.0.0.1:56321?host=example.invalid', 'binturong-documents-test'],
    ])
      expect(() => assertTestStorage(url, bucket)).toThrow()
  })

  it.each([
    '',
    'http://example.invalid',
    'https://user:secret@example.invalid',
    'https://example.invalid?override=1',
  ])('rejects missing or unsafe provider configuration: %s', (url) => {
    vi.stubEnv('OFFICIAL_STORAGE_URL', url)
    expect(() => getOfficialStorage()).toThrow()
  })

  it('requires a private PDF-only bucket with the exact byte limit', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    for (const bucket of [
      { ...privateBucket, public: true },
      { ...privateBucket, file_size_limit: null },
      { ...privateBucket, allowed_mime_types: ['*/*'] },
      privateBucket,
    ]) {
      fetch.mockResolvedValueOnce(Response.json(bucket))
      const check = getOfficialStorage().assertPrivateBucket()
      if (bucket === privateBucket) await expect(check).resolves.toBeUndefined()
      else await expect(check).rejects.toMatchObject({ status: 503 })
    }
    expect(fetch).toHaveBeenLastCalledWith(
      'http://127.0.0.1:56321/bucket/synthetic-documents',
      expect.objectContaining({ redirect: 'error', cache: 'no-store' }),
    )
  })

  it('issues only exact pending-path upload capabilities and never ready-path capabilities', async () => {
    const key = objectKey('pending')
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          url: `/object/upload/sign/synthetic-documents/${key}?token=synthetic-token`,
        }),
      )
    await expect(getOfficialStorage().createUploadToken(key)).resolves.toEqual('synthetic-token')
    await expect(getOfficialStorage().createUploadToken(objectKey('ready'))).rejects.toMatchObject({
      status: 400,
    })
    await expect(getOfficialStorage().createUploadToken('../escape.pdf')).rejects.toMatchObject({
      status: 400,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('bounds both declared and streamed object sizes and hides provider error details', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    fetch.mockResolvedValueOnce(
      new Response('not read', { headers: { 'Content-Length': String(MAX_DOCUMENT_BYTES + 1) } }),
    )
    await expect(getOfficialStorage().read(objectKey('ready'))).rejects.toMatchObject({
      status: 413,
    })
    fetch.mockResolvedValueOnce(new Response(new Uint8Array(MAX_DOCUMENT_BYTES + 1)))
    await expect(getOfficialStorage().read(objectKey('ready'))).rejects.toMatchObject({
      status: 413,
    })
    fetch.mockResolvedValueOnce(new Response('synthetic secret provider detail', { status: 500 }))
    await expect(getOfficialStorage().read(objectKey('ready'))).rejects.toMatchObject({
      status: 503,
    })
  })

  it('never overwrites a ready key and reports an existing canonical object separately', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ Key: 'created' }))
      .mockResolvedValueOnce(
        Response.json({ statusCode: '409', error: 'Duplicate' }, { status: 409 }),
      )
    const storage = getOfficialStorage()
    const key = objectKey('ready')
    const bytes = new Uint8Array([1, 2, 3])
    await expect(storage.writeVerified(key, bytes)).resolves.toBe(true)
    await expect(storage.writeVerified(key, bytes)).resolves.toBe(false)
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-upsert': 'false' }),
      }),
    )
  })

  it('derives PDF identity from original bytes and rejects disguised, empty and oversized files', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const bytes = await pdf.save()
    await expect(verifyPDF(bytes)).resolves.toEqual({
      size: bytes.byteLength,
      mimeType: 'application/pdf',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
    for (const bad of [
      new Uint8Array(),
      new TextEncoder().encode('%PDF-1.7\nnot a PDF\n%%EOF'),
      new Uint8Array(MAX_DOCUMENT_BYTES + 1),
    ])
      await expect(verifyPDF(bad)).rejects.toMatchObject({ status: expect.any(Number) })
    const empty = await PDFDocument.create()
    await expect(verifyPDF(await empty.save({ addDefaultPage: false }))).rejects.toMatchObject({
      status: 422,
    })
    const encrypted = await PDFDocument.create()
    encrypted.addPage()
    encrypted.context.trailerInfo.Encrypt = encrypted.context.register(
      encrypted.context.obj({ Filter: 'Standard' }),
    )
    await expect(verifyPDF(await encrypted.save())).rejects.toMatchObject({ status: 422 })
  })

  it('terminates a worker that exceeds the verification deadline', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const bytes = await pdf.save()
    vi.useFakeTimers()
    workerControl.stall = true
    const before = workerControl.terminations
    const rejected = expect(verifyPDF(bytes)).rejects.toMatchObject({ status: 422 })
    await vi.advanceTimersByTimeAsync(PDF_WORKER_TIMEOUT_MS)
    await rejected
    expect(workerControl.terminations).toBe(before + 1)
  })

  it('limits process concurrency and releases slots exactly once', () => {
    const first = acquireDocumentSlot()
    const second = acquireDocumentSlot()
    try {
      expect(() => acquireDocumentSlot()).toThrow()
      first()
      first()
      const replacement = acquireDocumentSlot()
      try {
        expect(() => acquireDocumentSlot()).toThrow()
      } finally {
        replacement()
      }
    } finally {
      first()
      second()
    }
    acquireDocumentSlot()()
  })
})
