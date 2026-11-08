import { APIError } from 'payload'

export const MAX_DOCUMENT_BYTES = 50_000_000
export const MAX_PENDING_UPLOADS_PER_ACTOR = 10
export const PDF_WORKER_TIMEOUT_MS = 15_000
export const STORAGE_TIMEOUT_MS = 30_000
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024
export const UPLOAD_SESSION_TTL_MS = 2 * 60 * 60 * 1000

let active = 0

export function acquireDocumentSlot(): () => void {
  if (active >= 2) throw new APIError('Document verification is busy. Try again shortly.', 503)
  active++
  let released = false
  return () => {
    if (released) return
    released = true
    active--
  }
}
