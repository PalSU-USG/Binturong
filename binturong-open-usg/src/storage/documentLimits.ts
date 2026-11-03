import { APIError } from 'payload'

export const MAX_DOCUMENT_BYTES = 50_000_000
export const PDF_WORKER_TIMEOUT_MS = 15_000
export const STORAGE_TIMEOUT_MS = 30_000
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024

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
