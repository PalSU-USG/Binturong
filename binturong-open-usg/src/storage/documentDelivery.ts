import { APIError, type PayloadRequest } from 'payload'
import { getActiveAccount } from '@/access/activeAccount'
import { serialID } from '@/jobs/publicationRevision'
import type { Document } from '@/payload-types'
import { acquireDocumentSlot } from './documentLimits'
import * as officialStorage from './officialStorage'
import { verifyPDF } from './verifyPDF'

const READY_KEY = /^ready\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/
const CHUNK_BYTES = 64 * 1024
const ABANDONED_RESPONSE_MS = 120_000
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

function pdfStream(bytes: Uint8Array, release: () => void) {
  let offset = 0
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        try {
          const end = Math.min(offset + CHUNK_BYTES, bytes.byteLength)
          controller.enqueue(bytes.subarray(offset, end))
          offset = end
          if (offset >= bytes.byteLength) {
            controller.close()
            release()
          }
        } catch (error) {
          release()
          controller.error(error)
        }
      },
      cancel: release,
    },
    { highWaterMark: 0 },
  )
}

export async function downloadDocument(req: PayloadRequest, documentID: number): Promise<Response> {
  if (!serialID(documentID)) throw new APIError('Choose a valid official document', 400)
  const doc = await authorize(req, documentID)
  const release = acquireDocumentSlot()
  let handedOff = false
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

    let released = false
    const releaseOnce = () => {
      if (released) return
      released = true
      release()
    }
    req.signal?.addEventListener('abort', releaseOnce, { once: true })
    // A response nobody reads or cancels must not hold a slot (and its buffer) forever.
    setTimeout(releaseOnce, ABANDONED_RESPONSE_MS).unref()
    const name = doc.originalFilename || 'document.pdf'
    handedOff = true
    return new Response(pdfStream(bytes, releaseOnce), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${asciiName(name)}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        'Content-Length': String(bytes.byteLength),
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Type': 'application/pdf',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } finally {
    if (!handedOff) release()
  }
}
