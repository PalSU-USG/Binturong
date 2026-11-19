import { APIError, type PayloadRequest } from 'payload'
import { getActiveAccount } from '@/access/activeAccount'
import { serialID } from '@/jobs/publicationRevision'
import type { Document } from '@/payload-types'
import { acquireDocumentDeliverySlot } from './documentLimits'
import * as officialStorage from './officialStorage'
import { verifyPDF } from './verifyPDF'

const READY_KEY = /^ready\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/
const CHUNK_BYTES = 64 * 1024
const ABANDONED_RESPONSE_MS = 120_000
// A reader that keeps pulling just inside the idle timeout must still finish eventually.
const DELIVERY_DEADLINE_MS = 10 * 60_000
// One response for guessed, unauthorized, unpublished and nonexistent IDs.
const notFound = () => new APIError('Official document not found', 404)

async function loadDocument(req: PayloadRequest, id: number): Promise<Document | null> {
  return req.payload.findByID({
    collection: 'documents',
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    req,
  })
}

async function isPublishedReference(req: PayloadRequest, id: number): Promise<boolean> {
  for (const collection of ['issuances', 'reports'] as const) {
    const { docs } = await req.payload.find({
      collection,
      draft: false,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      select: { _status: true },
      req,
      where: {
        and: [
          { _status: { equals: 'published' } },
          { or: [{ mainDocument: { equals: id } }, { attachments: { equals: id } }] },
        ],
      },
    })
    if (docs.length) return true
  }
  return false
}

/** Current authorization: an active staff account, or a currently published reference. */
async function authorize(req: PayloadRequest, id: number): Promise<Document> {
  const doc = await loadDocument(req, id)
  if (!doc) throw notFound()
  if (!(await getActiveAccount(req)) && !(await isPublishedReference(req, id))) throw notFound()
  if (doc.state !== 'ready') throw new APIError('This official document is not verified', 409)
  return doc
}

const asciiName = (name: string) =>
  name.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '_') || 'document.pdf'

function pdfStream(bytes: Uint8Array | null, release: () => void, signal?: AbortSignal) {
  let offset = 0
  let timer: ReturnType<typeof setTimeout>
  let deadline: ReturnType<typeof setTimeout>
  let controller: ReadableStreamDefaultController<Uint8Array>
  const cleanup = () => {
    bytes = null
    clearTimeout(timer)
    clearTimeout(deadline)
    signal?.removeEventListener('abort', abort)
    release()
  }
  const fail = (error: Error) => {
    if (!bytes) return
    controller.error(error)
    cleanup()
  }
  const abort = () => fail(new Error('Document delivery aborted'))
  const resetIdle = () => {
    clearTimeout(timer)
    timer = setTimeout(
      () => fail(new Error('Document delivery idle timeout')),
      ABANDONED_RESPONSE_MS,
    )
    timer.unref()
  }
  return new ReadableStream<Uint8Array>(
    {
      start(streamController) {
        controller = streamController
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) return abort()
        resetIdle()
        deadline = setTimeout(
          () => fail(new Error('Document delivery deadline exceeded')),
          DELIVERY_DEADLINE_MS,
        )
        deadline.unref()
      },
      pull() {
        if (!bytes) return
        try {
          const end = Math.min(offset + CHUNK_BYTES, bytes.byteLength)
          // A retained chunk must not retain the entire verified file's backing buffer.
          controller.enqueue(Uint8Array.prototype.slice.call(bytes, offset, end))
          offset = end
          if (offset >= bytes.byteLength) {
            controller.close()
            cleanup()
          } else resetIdle()
        } catch (error) {
          controller.error(error)
          cleanup()
        }
      },
      cancel: cleanup,
    },
    { highWaterMark: 0 },
  )
}

export async function downloadDocument(req: PayloadRequest, documentID: number): Promise<Response> {
  if (!serialID(documentID)) throw new APIError('Choose a valid official document', 400)
  const doc = await authorize(req, documentID)
  const release = acquireDocumentDeliverySlot()
  let handedOff = false
  let stream: ReadableStream<Uint8Array> | undefined
  try {
    if (
      !doc.storageKey ||
      !READY_KEY.test(doc.storageKey) ||
      !doc.sha256 ||
      typeof doc.size !== 'number'
    )
      throw new APIError('Official document storage is inconsistent', 502)
    const storage = officialStorage.getOfficialStorage()
    await storage.assertPrivateBucket()
    const bytes = await storage.read(doc.storageKey)
    let verified: Awaited<ReturnType<typeof verifyPDF>>
    try {
      verified = await verifyPDF(bytes)
    } catch (error) {
      if (error instanceof APIError && (error.status === 413 || error.status === 422))
        throw new APIError('Official document failed integrity verification', 502)
      throw error
    }
    if (verified.sha256 !== doc.sha256 || verified.size !== doc.size)
      throw new APIError('Official document failed integrity verification', 502)
    // Authorization may have been revoked, or the row replaced, while the bytes were verified.
    const current = await authorize(req, documentID)
    if (current.storageKey !== doc.storageKey || current.sha256 !== doc.sha256)
      throw new APIError('Official document changed during delivery. Try again.', 409)

    const name = Buffer.from(doc.originalFilename || 'document.pdf', 'utf8').toString('utf8')
    const disposition = `attachment; filename="${asciiName(name)}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
    stream = pdfStream(bytes, release, req.signal)
    const response = new Response(stream, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': disposition,
        'Content-Length': String(bytes.byteLength),
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Type': 'application/pdf',
        'X-Content-Type-Options': 'nosniff',
      },
    })
    handedOff = true
    return response
  } finally {
    if (!handedOff) {
      await stream?.cancel().catch(() => undefined)
      release()
    }
  }
}
