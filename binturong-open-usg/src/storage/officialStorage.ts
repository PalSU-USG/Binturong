import { APIError } from 'payload'
import { MAX_DOCUMENT_BYTES, STORAGE_TIMEOUT_MS } from './documentLimits'

const unavailable = () =>
  new APIError('Private document storage is unavailable. Try again later.', 503)
const validKey = (key: string) => /^(pending|ready)\/[a-f0-9-]{36}\.pdf$/.test(key)

// Keep the external storage-failure status while distinguishing confirmed absence internally.
export class DocumentObjectMissing extends APIError {
  constructor() {
    super('Official document object not found', 503)
  }
}

export function getOfficialStorage() {
  let url: URL
  try {
    url = new URL(process.env.OFFICIAL_STORAGE_URL || '')
  } catch {
    throw unavailable()
  }
  const key = process.env.OFFICIAL_STORAGE_SERVICE_KEY?.trim()
  const bucket = process.env.OFFICIAL_STORAGE_BUCKET || ''
  if (
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/', '/storage/v1', '/storage/v1/'].includes(url.pathname) ||
    !key ||
    !/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)
  )
    throw unavailable()
  const base = url.toString().replace(/\/$/, '')
  const objectPath = (objectKey: string) => {
    if (!validKey(objectKey)) throw new APIError('Choose a valid document object.', 400)
    return `${bucket}/${objectKey}`
  }
  async function request(path: string, init: RequestInit = {}) {
    try {
      return await fetch(`${base}${path}`, {
        ...init,
        headers: { apikey: key!, Authorization: `Bearer ${key}`, ...init.headers },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
      })
    } catch {
      throw unavailable()
    }
  }
  return {
    async assertPrivateBucket(): Promise<void> {
      const response = await request(`/bucket/${bucket}`)
      if (!response.ok) throw unavailable()
      const data = await response.json().catch(() => null)
      if (
        !data ||
        data.public !== false ||
        data.file_size_limit !== MAX_DOCUMENT_BYTES ||
        !Array.isArray(data.allowed_mime_types) ||
        data.allowed_mime_types.length !== 1 ||
        data.allowed_mime_types[0] !== 'application/pdf'
      )
        throw unavailable()
    },
    async createUploadToken(stagingKey: string): Promise<string> {
      const path = objectPath(stagingKey)
      if (!stagingKey.startsWith('pending/')) throw new APIError('Choose a pending upload.', 400)
      const response = await request(`/object/upload/sign/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-upsert': 'false' },
        body: '{}',
      })
      if (!response.ok) throw unavailable()
      const data = await response.json().catch(() => null)
      if (typeof data?.url !== 'string') throw unavailable()
      let signed: URL
      try {
        signed = new URL(data.url, `${base}/`)
      } catch {
        throw unavailable()
      }
      const expected = `/object/upload/sign/${path}`
      const token = signed.searchParams.get('token')
      if (
        signed.origin !== url.origin ||
        ![expected, `${url.pathname.replace(/\/$/, '')}${expected}`].includes(signed.pathname) ||
        signed.hash ||
        [...signed.searchParams.keys()].some((name) => name !== 'token') ||
        !token ||
        token.length > 8192 ||
        /[\r\n]/.test(token)
      )
        throw unavailable()
      return token
    },
    async read(objectKey: string): Promise<Uint8Array> {
      const response = await request(`/object/authenticated/${objectPath(objectKey)}`)
      if (!response.ok) {
        const failure = await response.json().catch(() => null)
        if (
          (response.status === 404 && failure?.code === 'NoSuchKey') ||
          (response.status === 400 &&
            failure?.error === 'not_found' &&
            failure?.message === 'Object not found')
        )
          throw new DocumentObjectMissing()
        throw unavailable()
      }
      if (!response.body) throw unavailable()
      const lengthHeader = response.headers.get('Content-Length')
      const declared = lengthHeader === null ? undefined : Number(lengthHeader)
      if (declared !== undefined && (!Number.isSafeInteger(declared) || declared < 0))
        throw unavailable()
      if (declared !== undefined && declared > MAX_DOCUMENT_BYTES) {
        await response.body.cancel().catch(() => undefined)
        throw new APIError('The PDF exceeds the 50 MB file limit.', 413)
      }
      const reader = response.body.getReader()
      const parts: Uint8Array[] = []
      let size = 0
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > MAX_DOCUMENT_BYTES) {
            await reader.cancel().catch(() => undefined)
            throw new APIError('The PDF exceeds the 50 MB file limit.', 413)
          }
          parts.push(chunk.value)
        }
      } catch (error) {
        if (error instanceof APIError) throw error
        throw unavailable()
      } finally {
        reader.releaseLock()
      }
      if (declared !== undefined && size !== declared) throw unavailable()
      return Buffer.concat(parts, size)
    },
    async writeVerified(objectKey: string, bytes: Uint8Array): Promise<boolean> {
      const path = objectPath(objectKey)
      if (!objectKey.startsWith('ready/'))
        throw new APIError('Choose a verified document key.', 400)
      if (bytes.byteLength > MAX_DOCUMENT_BYTES)
        throw new APIError('The PDF exceeds the 50 MB file limit.', 413)
      const response = await request(`/object/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
        body: bytes,
      })
      if (response.ok) return true
      const failure = await response.json().catch(() => null)
      if (response.status === 409 || (response.status === 400 && failure?.error === 'Duplicate'))
        return false
      throw unavailable()
    },
    uploadEndpoint: `${base}/upload/resumable/sign`,
    bucket,
  }
}
