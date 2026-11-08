import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { APIError } from 'payload'
import {
  MAX_DOCUMENT_BYTES,
  PDF_DECODED_STREAM_LIMIT_BYTES,
  PDF_DECODED_TOTAL_LIMIT_BYTES,
  PDF_WORKER_TIMEOUT_MS,
} from './documentLimits'

// Anchored at the server's working directory, not import.meta.url: bundlers rewrite a static
// require.resolve to a virtual module id, which the worker thread cannot load.
const parserPath = () => createRequire(join(process.cwd(), 'package.json')).resolve('pdf-lib')
const program = `
const { parentPort, workerData } = require('node:worker_threads');
const { PDFDocument, ParseSpeeds } = require(workerData.parser);
// Every pdf-lib stream decoder grows its output through ensureBuffer; a compressed object stream
// can inflate by orders of magnitude, and typed arrays are not bounded by the heap limit.
const decoder = require(require('node:path').join(require('node:path').dirname(workerData.parser), 'core/streams/DecodeStream.js')).default.prototype;
const ensureBuffer = decoder.ensureBuffer;
if (typeof ensureBuffer !== 'function') throw new Error('unsupported pdf-lib');
let decodedTotal = 0;
decoder.ensureBuffer = function (requested) {
  decodedTotal += Math.max(0, requested - (this.buffer ? this.buffer.length : 0));
  if (requested > workerData.streamLimit || decodedTotal > workerData.totalLimit) throw new Error('decoded size limit');
  return ensureBuffer.call(this, requested);
};
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
        workerData: {
          parser: parserPath(),
          bytes: workerBytes,
          streamLimit: PDF_DECODED_STREAM_LIMIT_BYTES,
          totalLimit: PDF_DECODED_TOTAL_LIMIT_BYTES,
        },
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
    worker.once('error', (error) => {
      if (!('code' in error) || error.code !== 'ERR_WORKER_OUT_OF_MEMORY')
        console.error('PDF verification worker failed:', error.message)
      finish(
        'code' in error && error.code === 'ERR_WORKER_OUT_OF_MEMORY'
          ? invalid()
          : new APIError('PDF verification is unavailable. Try again later.', 503),
      )
    })
    worker.once('exit', () => finish(invalid()))
  })
  return {
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mimeType: 'application/pdf',
  }
}
