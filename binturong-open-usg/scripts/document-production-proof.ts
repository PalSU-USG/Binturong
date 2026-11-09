import 'dotenv/config'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { deflateSync } from 'node:zlib'
import { parseArgs } from 'node:util'
import { Upload } from 'tus-js-client'

/**
 * Measurement harness for private documents, against the guarded local test stack only.
 *   worker: verifyPDF on hostile/maximum inputs in this process, sampling RSS.
 *   server: through a built `next start` (--base, --server-pid): upload, verify, publish,
 *           anonymous download by hash, hostile finalize, with the server's peak working set.
 * All inputs are synthetic.
 */

const MB = 1_000_000
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function peakWorkingSetMB(pid: number): number {
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).PeakWorkingSet64`],
    { encoding: 'utf8' },
  )
  return Math.round(Number(result.stdout.trim()) / 1024 / 1024)
}

async function hostile() {
  const { PDFDocument, PDFName } = await import('pdf-lib')
  const base = await PDFDocument.create()
  base.addPage()
  const valid = (n: number) => async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage()
    const filler = new Uint8Array(n)
    for (let i = 0; i < filler.length; i++) filler[i] = (i * 2654435761) >>> 24
    page.node.set(PDFName.of('Filler'), pdf.context.register(pdf.context.stream(filler)))
    return pdf.save({ useObjectStreams: false })
  }
  const text = (s: string) => new TextEncoder().encode(s)
  const objectStreamBomb = (inflatedBytes: number) => () => {
    const body = Buffer.concat([Buffer.from('5 0 '), Buffer.alloc(inflatedBytes, 0x20)])
    const z = deflateSync(body, { level: 9 })
    return Buffer.concat([
      Buffer.from(
        '%PDF-1.5\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n' +
          '2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n' +
          '3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>\nendobj\n' +
          `4 0 obj\n<</Type/ObjStm/N 1/First 4/Filter/FlateDecode/Length ${z.length}>>\nstream\n`,
      ),
      z,
      Buffer.from('\nendstream\nendobj\ntrailer\n<</Root 1 0 R/Size 6>>\n%%EOF\n'),
    ])
  }
  const cases: [string, () => Promise<Uint8Array> | Uint8Array][] = [
    ['valid 13 MB', valid(13 * MB)],
    ['valid max 50 MB', async () => (await valid(50 * MB - 2000)()).subarray(0, 50 * MB)],
    ['50 MB non-PDF bytes', () => Buffer.alloc(50 * MB, 0x41)],
    ['50 MB object flood', () => text('%PDF-1.7\n' + '1 0 obj\n<<>>\nendobj\n'.repeat(2_400_000))],
    [
      '24M-deep nested array',
      () => text('%PDF-1.7\n1 0 obj\n' + '['.repeat(24 * MB) + ']'.repeat(24 * MB)),
    ],
    ['object stream inflating to 300 MB', objectStreamBomb(300 * MB)],
    ['object stream inflating to 1000 MB', objectStreamBomb(1000 * MB)],
  ]
  const { verifyPDF } = await import('../src/storage/verifyPDF')
  for (const [name, make] of cases) {
    const bytes = await make()
    const before = process.memoryUsage().rss
    let peak = before
    const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 20)
    const started = performance.now()
    let outcome = 'verified'
    try {
      await verifyPDF(bytes)
    } catch (error) {
      outcome = `${(error as { status?: number }).status}: ${(error as Error).message}`
    }
    clearInterval(timer)
    console.log(
      `${name}: input ${(bytes.byteLength / MB).toFixed(1)} MB, ${outcome}, ` +
        `${Math.round(performance.now() - started)} ms, RSS growth during verification ${Math.round((peak - before) / 1024 / 1024)} MB (peak ${Math.round(peak / 1024 / 1024)} MB)`,
    )
  }
}

async function server(baseURL: string, serverPID: number) {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const { createAccessFixtures, removeTestAccounts } =
    await import('../tests/helpers/accessFixtures')
  const { removeObjects, largeSyntheticPDF } = await import('../tests/helpers/officialFileFixtures')
  const { assertTestStorage } = await import('../tests/helpers/assertTestStorage')
  assertTestStorage(process.env.OFFICIAL_STORAGE_URL, process.env.OFFICIAL_STORAGE_BUCKET)
  const payload = await getPayload({ config })
  const fixtures = await createAccessFixtures(payload)
  const editor = fixtures.tokens.editor
  const publisher = fixtures.tokens.publisher
  const org = await payload.create({
    collection: 'organizations',
    draft: true,
    overrideAccess: false,
    user: { ...fixtures.users.editor, collection: 'users' },
    data: { name: `Synthetic production org ${randomUUID()}`, kind: 'usg' },
  })
  const call = (token: string | null, path: string, init: RequestInit = {}) =>
    fetch(`${baseURL}${path}`, {
      ...init,
      headers: {
        ...(token ? { Authorization: `JWT ${token}` } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
  let issuanceID = 0
  try {
    const review = await (await call(publisher, `/api/organizations/${org.id}/review`)).json()
    await call(publisher, `/api/organizations/${org.id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ action: 'publish', expected: review.expected }),
    })
    console.log(`server idle peak working set: ${peakWorkingSetMB(serverPID)} MB`)

    async function upload(label: string, bytes: Uint8Array) {
      const begin = await call(editor, '/api/documents/begin-upload', {
        method: 'POST',
        body: JSON.stringify({
          title: label,
          organization: org.id,
          originalFilename: 'proof.pdf',
          requestId: randomUUID(),
        }),
      })
      const session = await begin.json()
      const started = performance.now()
      await new Promise<void>((resolve, reject) => {
        new Upload(Buffer.from(bytes), {
          endpoint: session.upload.endpoint,
          headers: { 'x-signature': session.upload.token, 'x-upsert': 'false' },
          chunkSize: 6 * 1024 * 1024,
          uploadDataDuringCreation: true,
          metadata: {
            bucketName: session.upload.bucket,
            objectName: session.upload.path,
            contentType: 'application/pdf',
            cacheControl: '3600',
          },
          onError: reject,
          onSuccess: () => resolve(),
        }).start()
      })
      const uploaded = performance.now()
      const finalize = await call(editor, `/api/documents/${session.documentID}/finalize`, {
        method: 'POST',
      })
      const finalizeBody = await finalize.json()
      console.log(
        `${label}: upload ${Math.round(uploaded - started)} ms, finalize ${finalize.status} in ` +
          `${Math.round(performance.now() - uploaded)} ms${finalize.ok ? '' : ` (${finalizeBody.errors?.[0]?.message})`}; ` +
          `server peak working set ${peakWorkingSetMB(serverPID)} MB`,
      )
      return { id: session.documentID as number, ok: finalize.ok }
    }

    const sizes: [string, number][] = [
      ['13 MB (over the 4.5 MB request limit)', 13 * MB],
      ['maximum 50 MB', 50 * MB - 2000],
    ]
    for (const [label, size] of sizes) {
      const bytes = await largeSyntheticPDF(size, `Synthetic production ${label}`)
      const { id, ok } = await upload(label, bytes.subarray(0, 50 * MB))
      if (!ok) throw new Error(`${label} finalize failed`)
      if (label.startsWith('13')) {
        const issuance = await payload.create({
          collection: 'issuances',
          draft: true,
          overrideAccess: false,
          user: { ...fixtures.users.editor, collection: 'users' },
          data: {
            title: 'Synthetic production proof',
            type: 'advisory',
            organization: org.id,
            mainDocument: id,
          },
        })
        issuanceID = issuance.id
        const ir = await (await call(publisher, `/api/issuances/${issuanceID}/review`)).json()
        const published = await call(publisher, `/api/issuances/${issuanceID}/transition`, {
          method: 'POST',
          body: JSON.stringify({ action: 'publish', expected: ir.expected }),
        })
        console.log(`publish: ${published.status}`)
      }
      const started = performance.now()
      const download = await call(null, `/api/documents/${id}/file`)
      const body = new Uint8Array(await download.arrayBuffer())
      const publicStatus = download.status
      const staff = label.startsWith('13') ? null : await call(editor, `/api/documents/${id}/file`)
      const staffBody = staff ? new Uint8Array(await staff.arrayBuffer()) : null
      console.log(
        `${label}: anonymous download ${publicStatus} ${body.byteLength} bytes in ` +
          `${Math.round(performance.now() - started)} ms` +
          `${staff ? `; staff download ${staff.status}` : ''}; exact bytes ` +
          `${sha(body) === sha(bytes) || (staffBody && sha(staffBody) === sha(bytes))}; ` +
          `server peak working set ${peakWorkingSetMB(serverPID)} MB`,
      )
    }

    const flood = Buffer.from('%PDF-1.7\n' + '1 0 obj\n<<>>\nendobj\n'.repeat(2_400_000))
    await upload('hostile 50 MB object flood', flood)
    await upload('hostile 50 MB non-PDF', Buffer.alloc(50 * MB, 0x41))
  } finally {
    if (issuanceID) {
      await payload.db.deleteVersions({
        collection: 'issuances',
        where: { parent: { equals: issuanceID } },
      })
      await payload.db.deleteOne({ collection: 'issuances', where: { id: { equals: issuanceID } } })
    }
    const owned = (
      await payload.db.find({
        collection: 'documents',
        where: { organization: { equals: org.id } },
        pagination: false,
      })
    ).docs as { id: number; storageKey?: string; stagingKey?: string }[]
    for (const { id } of owned.sort((a, b) => b.id - a.id))
      await payload.db.deleteOne({ collection: 'documents', where: { id: { equals: id } } })
    await removeObjects(
      owned.flatMap((row) => [row.storageKey, row.stagingKey]).filter(Boolean) as string[],
    )
    await payload.db.deleteVersions({
      collection: 'organizations',
      where: { parent: { equals: org.id } },
    })
    await payload.db.deleteOne({ collection: 'organizations', where: { id: { equals: org.id } } })
    await removeTestAccounts(
      payload,
      Object.values(fixtures.users).map(({ id }) => id),
    )
  }
}

const { values } = parseArgs({
  options: { mode: { type: 'string' }, base: { type: 'string' }, 'server-pid': { type: 'string' } },
})
const run =
  values.mode === 'worker'
    ? hostile()
    : values.mode === 'server' && values.base && values['server-pid']
      ? server(values.base, Number(values['server-pid']))
      : Promise.reject(
          new Error('Usage: --mode worker | --mode server --base <url> --server-pid <pid>'),
        )
run.then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Proof failed')
    process.exit(1)
  },
)
