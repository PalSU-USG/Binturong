import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { buildManifest, restoreFromBackup, type ManifestEntry } from '@/storage/documentManifest'
import * as officialStorage from '@/storage/officialStorage'
import { assertTestStorage } from '../helpers/assertTestStorage'
import {
  removeObjects,
  seedFile,
  sha256Hex,
  syntheticPDF,
  type SeededFile,
} from '../helpers/officialFileFixtures'

describe('document manifest, backup and restore', () => {
  let payload: Payload
  let storage: ReturnType<typeof officialStorage.getOfficialStorage>
  let dir: string
  const tracker = { keys: [] as string[] }
  const rows: number[] = []
  let org: number

  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })
  beforeAll(async () => {
    assertTestStorage(process.env.OFFICIAL_STORAGE_URL, process.env.OFFICIAL_STORAGE_BUCKET)
    payload = await getPayload({ config })
    storage = officialStorage.getOfficialStorage()
    dir = await mkdtemp(join(tmpdir(), 'synthetic-backup-'))
    const created = await payload.db.create({
      collection: 'organizations',
      data: { name: `Synthetic manifest org ${randomUUID()}`, kind: 'usg' },
    })
    org = Number(created.id)
  })
  afterAll(async () => {
    for (const id of [...rows].reverse())
      await payload.db.deleteOne({ collection: 'documents', where: { id: { equals: id } } })
    await payload.db.deleteOne({ collection: 'organizations', where: { id: { equals: org } } })
    await removeObjects(tracker.keys)
    await rm(dir, { recursive: true, force: true })
  })

  async function seed(options: Parameters<typeof seedFile>[3] = {}) {
    const file = await seedFile(payload, tracker, org, options)
    rows.push(file.id)
    return file
  }
  const backupPath = (entry: ManifestEntry) => join(dir, `${entry.documentID}-${entry.sha256}.pdf`)

  it('records identity, hash, size and previousVersion, flags mismatches, and restores exact bytes', async () => {
    const first = await seed({ bytes: await syntheticPDF('Synthetic manifest one', 4096) })
    const second = await seed({ bytes: await syntheticPDF('Synthetic manifest two', 8192) })
    await payload.db.updateOne({
      collection: 'documents',
      id: second.id,
      data: { previousVersion: first.id },
    })
    const wrong = await seed({ metadataSha: 'f'.repeat(64) })
    const originals = new Map<number, SeededFile>([first, second, wrong].map((f) => [f.id, f]))

    const backedUp: number[] = []
    const manifest = await buildManifest(payload, storage, {
      organizations: [org],
      onVerified: async (entry, bytes) => {
        backedUp.push(entry.documentID)
        await writeFile(backupPath(entry), bytes, { flag: 'wx' })
      },
    })

    expect(manifest.map((e) => e.documentID)).toEqual([first.id, second.id, wrong.id])
    expect(manifest[0]).toMatchObject({
      documentID: first.id,
      organization: org,
      storageKey: first.key,
      size: first.bytes.byteLength,
      sha256: first.sha256,
      previousVersion: null,
      status: 'ok',
    })
    expect(manifest[1]).toMatchObject({ previousVersion: first.id, status: 'ok' })
    expect(manifest[2]).toMatchObject({ status: 'mismatch', observed: { sha256: wrong.sha256 } })
    expect(backedUp).toEqual([first.id, second.id])

    // Lose the ready objects (test-owned), then restore from the backup only.
    await removeObjects([first.key, second.key])
    await expect(storage.read(first.key)).rejects.toThrow()
    const restored = await restoreFromBackup(
      manifest.filter((e) => e.status === 'ok'),
      storage,
      (entry) => readFile(backupPath(entry)),
    )
    expect(restored).toEqual([
      { documentID: first.id, outcome: 'restored' },
      { documentID: second.id, outcome: 'restored' },
    ])
    // Compare against the original synthetic inputs, not the manifest or the backup.
    for (const id of [first.id, second.id]) {
      const original = originals.get(id)!
      const stored = await storage.read(original.key)
      expect(Buffer.compare(Buffer.from(stored), Buffer.from(original.bytes))).toBe(0)
      expect(sha256Hex(stored)).toBe(original.sha256)
    }
    const after = await buildManifest(payload, storage, { organizations: [org] })
    expect(after).toEqual(manifest)

    // Re-running is idempotent and never overwrites.
    const again = await restoreFromBackup(
      manifest.filter((e) => e.status === 'ok'),
      storage,
      (entry) => readFile(backupPath(entry)),
    )
    expect(again.map((r) => r.outcome)).toEqual(['already-present', 'already-present'])
  })

  it('refuses tampered backups and never overwrites a differing object', async () => {
    const good = await seed({ bytes: await syntheticPDF('Synthetic manifest good', 4096) })
    const other = await syntheticPDF('Synthetic manifest other', 4096)
    const [entry] = await buildManifest(payload, storage, { organizations: [org] }).then((all) =>
      all.filter((e) => e.documentID === good.id),
    )
    // Tampered backup: wrong bytes for the recorded hash.
    const tampered = await restoreFromBackup([entry!], storage, async () => other)
    expect(tampered).toEqual([{ documentID: good.id, outcome: 'backup-invalid' }])
    // Missing backup file.
    const missing = await restoreFromBackup([entry!], storage, (e) => readFile(backupPath(e)))
    expect(missing[0]!.outcome).toBe('backup-invalid')
    // Present object with different bytes than the manifest (row hash edited): conflict, untouched.
    const conflicting = { ...entry!, sha256: sha256Hex(other), size: other.byteLength }
    const result = await restoreFromBackup([conflicting], storage, async () => other)
    expect(result).toEqual([{ documentID: good.id, outcome: 'conflict' }])
    const stored = await storage.read(good.key)
    expect(Buffer.compare(Buffer.from(stored), Buffer.from(good.bytes))).toBe(0)
  })

  it('reports storage failures as unreadable, never as ok', async () => {
    const lost = await seed({ writeObject: false })
    const manifest = await buildManifest(payload, storage, { organizations: [org] })
    expect(manifest.find((e) => e.documentID === lost.id)).toMatchObject({ status: 'unreadable' })
  })
})
