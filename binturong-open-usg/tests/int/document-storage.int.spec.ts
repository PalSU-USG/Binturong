import { createHash, randomUUID } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DocumentObjectMissing, getOfficialStorage } from '@/storage/officialStorage'
import {
  acquireDocumentSlot,
  MAX_DOCUMENT_BYTES,
  PDF_WORKER_TIMEOUT_MS,
} from '@/storage/documentLimits'
import { verifyPDF } from '@/storage/verifyPDF'
import { assertTestStorage } from '../helpers/assertTestStorage'

const workerControl = vi.hoisted(() => ({ stall: false, terminations: 0, totalLimit: 0 }))
vi.mock('node:worker_threads', async (original) => {
  const actual = await original<typeof import('node:worker_threads')>()
  return {
    ...actual,
    Worker: class extends actual.Worker {
      constructor(filename: string | URL, options?: import('node:worker_threads').WorkerOptions) {
        super(workerControl.stall ? 'setInterval(() => {}, 1000)' : filename, {
          ...options,
          workerData: {
            ...options?.workerData,
            ...(workerControl.totalLimit ? { totalLimit: workerControl.totalLimit } : {}),
          },
        })
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
    workerControl.totalLimit = 0
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
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
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

  it('distinguishes confirmed missing objects from operational provider failures', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    for (const [status, body, missing] of [
      [404, { code: 'NoSuchKey' }, true],
      [400, { error: 'not_found', message: 'Object not found' }, true],
      [404, { code: 'NoSuchBucket' }, false],
      [503, { code: 'InternalError' }, false],
    ] as const) {
      fetch.mockResolvedValueOnce(Response.json(body, { status }))
      const error = await getOfficialStorage()
        .read(objectKey('ready'))
        .catch((error: unknown) => error)
      expect(error).toMatchObject({ status: 503 })
      expect(error instanceof DocumentObjectMissing).toBe(missing)
    }
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
    const rejected = expect(verifyPDF(bytes)).rejects.toMatchObject({ status: 503 })
    await vi.advanceTimersByTimeAsync(PDF_WORKER_TIMEOUT_MS)
    await rejected
    expect(workerControl.terminations).toBe(before + 1)
  })

  it('charges rounded decoder allocations across multiple streams before allocation', async () => {
    const streams = [4, 6].map((id) => {
      const content = Buffer.from(`${id + 1} 0 null`.padEnd(1100, ' '))
      const compressed = deflateSync(content, { level: 0 })
      return Buffer.concat([
        Buffer.from(
          `${id} 0 obj\n<</Type/ObjStm/N 1/First 4/Filter/FlateDecode/Length ${compressed.length}>>\nstream\n`,
        ),
        compressed,
        Buffer.from('\nendstream\nendobj\n'),
      ])
    })
    const bytes = Buffer.concat([
      Buffer.from(
        '%PDF-1.5\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>\nendobj\n',
      ),
      ...streams,
      Buffer.from('trailer\n<</Root 1 0 R/Size 8>>\n%%EOF\n'),
    ])
    workerControl.totalLimit = 4096
    await expect(verifyPDF(bytes)).resolves.toMatchObject({ size: bytes.length })
    workerControl.totalLimit = 3000
    await expect(verifyPDF(bytes)).rejects.toMatchObject({ status: 422 })
  })

  it('rejects a compressed object stream that inflates far past the worker memory budget', async () => {
    const inflated = 300 * 1_000_000
    const stream = deflateSync(Buffer.concat([Buffer.from('5 0 '), Buffer.alloc(inflated, 0x20)]), {
      level: 9,
    })
    const bomb = Buffer.concat([
      Buffer.from(
        '%PDF-1.5\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n' +
          '2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n' +
          '3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>\nendobj\n' +
          `4 0 obj\n<</Type/ObjStm/N 1/First 4/Filter/FlateDecode/Length ${stream.length}>>\nstream\n`,
      ),
      stream,
      Buffer.from('\nendstream\nendobj\ntrailer\n<</Root 1 0 R/Size 6>>\n%%EOF\n'),
    ])
    expect(bomb.byteLength).toBeLessThan(1_000_000)
    const baseline = process.memoryUsage().rss
    let peak = baseline
    const sampler = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 10)
    try {
      await expect(verifyPDF(bomb)).rejects.toMatchObject({ status: 422 })
    } finally {
      clearInterval(sampler)
    }
    // The JS heap limit does not cover typed-array growth; the worker must stop decoding itself.
    expect(peak - baseline).toBeLessThan(350 * 1024 * 1024)
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
