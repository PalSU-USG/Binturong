import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import { APIError } from 'payload'
import { MAX_DOCUMENT_BYTES, PDF_WORKER_TIMEOUT_MS } from './documentLimits'

const require = createRequire(import.meta.url)
const program = `
const { parentPort, workerData } = require('node:worker_threads');
const { PDFDocument, ParseSpeeds } = require(workerData.parser);
(async () => {
  try {
    const pdf = await PDFDocument.load(workerData.bytes, {
      ignoreEncryption: false, throwOnInvalidObject: true,
      parseSpeed: ParseSpeeds.Fastest, updateMetadata: false
    });
    parentPort.postMessage({ ok: !pdf.isEncrypted && pdf.getPageCount() > 0 });
  } catch { parentPort.postMessage({ ok: false }); }
})();
`

export async function verifyPDF(bytes: Uint8Array): Promise<{
  size: number
  sha256: string
  mimeType: 'application/pdf'
}> {
  if (!bytes.byteLength || bytes.byteLength > MAX_DOCUMENT_BYTES)
    throw new APIError('Choose a nonempty PDF no larger than 50 MB.', 413)
  const workerBytes = Uint8Array.from(bytes)
  await new Promise<void>((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(program, {
        eval: true,
        workerData: { parser: require.resolve('pdf-lib'), bytes: workerBytes },
        transferList: [workerBytes.buffer],
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      })
    } catch {
      reject(new APIError('PDF verification is unavailable. Try again later.', 503))
      return
    }
    let settled = false
    const finish = (error?: APIError) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void worker.terminate().catch(() => undefined)
      if (error) reject(error)
      else resolve()
    }
    const invalid = () => new APIError('Choose a valid, nonempty, unencrypted PDF.', 422)
    const timer = setTimeout(
      () => finish(new APIError('The PDF exceeds verification resource limits.', 422)),
      PDF_WORKER_TIMEOUT_MS,
    )
    worker.once('message', (message) => finish(message?.ok === true ? undefined : invalid()))
    worker.once('error', (error) =>
      finish(
        'code' in error && error.code === 'ERR_WORKER_OUT_OF_MEMORY'
          ? invalid()
          : new APIError('PDF verification is unavailable. Try again later.', 503),
      ),
    )
    worker.once('exit', () => finish(invalid()))
  })
  return {
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mimeType: 'application/pdf',
  }
}
