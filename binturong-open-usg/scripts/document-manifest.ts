import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const usage = `Usage:
  npm run documents:manifest -- --out <manifest.json> [--backup-dir <dir>]
  npm run documents:manifest -- --restore <manifest.json> --backup-dir <dir> --apply
Manifest mode is read-only. Backup files are written create-only; restore only creates absent
objects (never overwrites) and verifies every byte against the manifest.`

const backupName = (documentID: number, sha256: string) => `${documentID}-${sha256}.pdf`

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
      'backup-dir': { type: 'string' },
      restore: { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
  })
  if (!values.out === !values.restore) throw new Error(usage)
  const backupDir = values['backup-dir']
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const { getOfficialStorage } = await import('../src/storage/officialStorage')
  const { buildManifest, restoreFromBackup } = await import('../src/storage/documentManifest')
  const storage = getOfficialStorage()
  const payload = await getPayload({ config })
  try {
    if (values.out) {
      if (backupDir) await mkdir(backupDir, { recursive: true })
      const manifest = await buildManifest(payload, storage, {
        onVerified: async (entry, bytes) => {
          if (backupDir)
            await writeFile(join(backupDir, backupName(entry.documentID, entry.sha256)), bytes, {
              flag: 'wx',
            }).catch((error: NodeJS.ErrnoException) => {
              if (error.code !== 'EEXIST') throw error
            })
        },
      })
      await writeFile(values.out, JSON.stringify(manifest, null, 2), { flag: 'wx' })
      const bad = manifest.filter((entry) => entry.status !== 'ok')
      console.log(`Manifest: ${manifest.length} ready documents, ${bad.length} not verified`)
      if (bad.length) process.exitCode = 2
    } else {
      if (!backupDir || !values.apply) throw new Error(usage)
      const manifest = JSON.parse(await readFile(values.restore!, 'utf8'))
      const results = await restoreFromBackup(manifest, storage, (entry) =>
        readFile(join(backupDir, backupName(entry.documentID, entry.sha256))),
      )
      for (const { documentID, outcome } of results) console.log(`${documentID}: ${outcome}`)
      if (results.some(({ outcome }) => outcome === 'conflict' || outcome === 'backup-invalid'))
        process.exitCode = 2
    }
  } finally {
    await payload.destroy()
  }
}

// The installed adapter retains a pool client; match Payload's CLI exit after cleanup.
main().then(
  () => process.exit(process.exitCode ?? 0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Document manifest failed')
    process.exit(1)
  },
)
