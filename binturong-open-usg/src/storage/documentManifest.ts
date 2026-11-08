import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import type { getOfficialStorage } from './officialStorage'

type Storage = Pick<ReturnType<typeof getOfficialStorage>, 'read' | 'writeVerified'>

export type ManifestEntry = {
  documentID: number
  organization: number
  storageKey: string
  size: number
  sha256: string
  previousVersion: number | null
  /** ok: stored bytes match the row. mismatch: stored bytes differ. unreadable: storage failed. */
  status: 'ok' | 'mismatch' | 'unreadable'
  observed?: { size: number; sha256: string }
}

const PAGE = 100
const relationID = (value: unknown): number | null => {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'number' ? id : null
}
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/**
 * Read-only inventory of ready Documents: row metadata from Payload, observed size and hash from
 * storage. Objects are read one at a time so memory stays bounded by one file. Nothing is deleted.
 * `onVerified` receives only bytes that match the row, for backup.
 */
export async function buildManifest(
  payload: Payload,
  storage: Pick<Storage, 'read'>,
  options: {
    organizations?: number[]
    onVerified?: (entry: ManifestEntry, bytes: Uint8Array) => Promise<void>
  } = {},
): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = []
  for (let page = 1; ; page++) {
    const result = await payload.db.find({
      collection: 'documents',
      page,
      limit: PAGE,
      sort: 'id',
      where: {
        and: [
          { state: { equals: 'ready' } },
          ...(options.organizations ? [{ organization: { in: options.organizations } }] : []),
        ],
      },
    })
    for (const row of result.docs as Record<string, unknown>[]) {
      const entry: ManifestEntry = {
        documentID: Number(row.id),
        organization: relationID(row.organization)!,
        storageKey: String(row.storageKey),
        size: Number(row.size),
        sha256: String(row.sha256),
        previousVersion: relationID(row.previousVersion),
        status: 'unreadable',
      }
      let bytes: Uint8Array | null = null
      try {
        bytes = await storage.read(entry.storageKey)
      } catch {
        bytes = null
      }
      if (bytes) {
        entry.observed = { size: bytes.byteLength, sha256: digest(bytes) }
        entry.status =
          entry.observed.size === entry.size && entry.observed.sha256 === entry.sha256
            ? 'ok'
            : 'mismatch'
        if (entry.status === 'ok') await options.onVerified?.(entry, bytes)
      }
      entries.push(entry)
    }
    if (!result.hasNextPage) return entries
  }
}

export type RestoreResult = {
  documentID: number
  outcome: 'restored' | 'already-present' | 'conflict' | 'backup-invalid'
}

/**
 * Re-creates absent ready objects from verified backup bytes. Create-only: an existing object is
 * never overwritten, and a present object whose bytes differ is reported as a conflict.
 */
export async function restoreFromBackup(
  manifest: ManifestEntry[],
  storage: Storage,
  readBackup: (entry: ManifestEntry) => Promise<Uint8Array>,
): Promise<RestoreResult[]> {
  const results: RestoreResult[] = []
  for (const entry of manifest) {
    const { documentID } = entry
    let bytes: Uint8Array
    try {
      bytes = await readBackup(entry)
    } catch {
      results.push({ documentID, outcome: 'backup-invalid' })
      continue
    }
    if (bytes.byteLength !== entry.size || digest(bytes) !== entry.sha256) {
      results.push({ documentID, outcome: 'backup-invalid' })
      continue
    }
    const created = await storage.writeVerified(entry.storageKey, bytes)
    const stored = await storage.read(entry.storageKey)
    const matches = stored.byteLength === entry.size && digest(stored) === entry.sha256
    results.push({
      documentID,
      outcome: !matches ? 'conflict' : created ? 'restored' : 'already-present',
    })
  }
  return results
}
