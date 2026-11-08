import { createHash, randomUUID } from 'node:crypto'
import { PDFDocument, PDFName } from 'pdf-lib'
import { createLocalReq, type Payload } from 'payload'

import { withAccountProvisioning } from '@/collections/Users/accountProvisioning'
import * as officialStorage from '@/storage/officialStorage'
import { assertTestStorage } from './assertTestStorage'

export const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export async function syntheticPDF(label: string, minBytes = 2048): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(label)
  pdf.addPage([612, 792]).drawText(`${label} ${' synthetic '.repeat(Math.ceil(minBytes / 11))}`)
  return pdf.save()
}

export type SeededFile = { id: number; key: string; bytes: Uint8Array; sha256: string }

/** Seeds a Documents row (and, unless disabled, its immutable object) directly, bypassing hooks. */
export async function seedFile(
  payload: Payload,
  tracker: { keys: string[] },
  organization: number,
  options: {
    bytes?: Uint8Array
    key?: string
    metadataSha?: string
    state?: 'pending' | 'ready' | 'failed'
    writeObject?: boolean
    originalFilename?: string
  } = {},
): Promise<SeededFile> {
  const bytes = options.bytes ?? (await syntheticPDF(`Synthetic official ${randomUUID()}`))
  const key = options.key ?? `ready/${randomUUID()}.pdf`
  if (options.writeObject !== false && /^(pending|ready)\/[a-f0-9-]{36}\.pdf$/.test(key)) {
    assertTestStorage(process.env.OFFICIAL_STORAGE_URL, process.env.OFFICIAL_STORAGE_BUCKET)
    const storage = officialStorage.getOfficialStorage()
    // writeVerified only accepts ready/ keys; tampered-key fixtures never need an object.
    if (key.startsWith('ready/')) await storage.writeVerified(key, bytes)
    tracker.keys.push(key)
  }
  const sha256 = sha256Hex(bytes)
  const doc = await payload.db.create({
    collection: 'documents',
    data: {
      organization,
      title: `Synthetic file ${randomUUID()}`,
      state: options.state ?? 'ready',
      storageKey: key,
      originalFilename: options.originalFilename ?? 'synthetic-official.pdf',
      mimeType: 'application/pdf',
      size: bytes.byteLength,
      sha256: options.metadataSha ?? sha256,
      verifiedAt: new Date().toISOString(),
    },
  })
  return { id: Number(doc.id), key, bytes, sha256 }
}

export async function removeObjects(keys: string[]): Promise<void> {
  if (!keys.length) return
  assertTestStorage(process.env.OFFICIAL_STORAGE_URL, process.env.OFFICIAL_STORAGE_BUCKET)
  await fetch(`${process.env.OFFICIAL_STORAGE_URL}/object/${process.env.OFFICIAL_STORAGE_BUCKET}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${process.env.OFFICIAL_STORAGE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: [...new Set(keys)] }),
  }).catch(() => undefined)
}

export async function createDisposableAccount(
  payload: Payload,
  role: 'editor' | 'publisher',
): Promise<{ id: number; user: Record<string, unknown> & { id: number } }> {
  const req = await createLocalReq({}, payload)
  const user = await withAccountProvisioning(req, () =>
    payload.create({
      collection: 'users',
      req,
      data: {
        email: `synthetic-disposable-${randomUUID()}@example.invalid`,
        password: 'synthetic-disposable-password',
        name: `Synthetic disposable ${role}`,
        role,
        disabled: false,
        authRevision: 0,
      },
    }),
  )
  return { id: user.id, user: user as never }
}

export async function disableAccount(payload: Payload, id: number): Promise<void> {
  const req = await createLocalReq({}, payload)
  await withAccountProvisioning(req, () =>
    payload.update({ collection: 'users', id, req, data: { disabled: true } }),
  )
}

/** Valid, loadable synthetic PDF of about `bytes` bytes (deterministic filler in an unused stream). */
export async function largeSyntheticPDF(
  bytes: number,
  label = 'Synthetic large',
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(label)
  const page = pdf.addPage([612, 792])
  page.drawText(label)
  const filler = new Uint8Array(bytes)
  for (let i = 0; i < filler.length; i++) filler[i] = (i * 2654435761) >>> 24
  const stream = pdf.context.stream(filler)
  page.node.set(PDFName.of('SyntheticFiller'), pdf.context.register(stream))
  return pdf.save({ useObjectStreams: false })
}
