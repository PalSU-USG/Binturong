import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import { downloadDocument } from '@/storage/documentDelivery'
import * as limits from '@/storage/documentLimits'

const fixture = vi.hoisted(() => ({ name: 'synthetic.pdf', bytes: new Uint8Array(200_000) }))
vi.mock('@/access/activeAccount', () => ({ getActiveAccount: async () => ({ id: 1 }) }))
vi.mock('@/storage/officialStorage', () => ({
  getOfficialStorage: () => ({
    assertPrivateBucket: async () => {},
    read: async () => fixture.bytes,
  }),
}))
vi.mock('@/storage/verifyPDF', () => ({
  verifyPDF: async () => ({ sha256: 'synthetic', size: fixture.bytes.length }),
}))

const request = (signal?: AbortSignal) =>
  ({
    signal,
    payload: {
      findByID: async () => ({
        id: 1,
        state: 'ready',
        storageKey: 'ready/00000000-0000-0000-0000-000000000001.pdf',
        sha256: 'synthetic',
        size: fixture.bytes.length,
        originalFilename: fixture.name,
      }),
    },
  }) as unknown as PayloadRequest

describe('verified delivery lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    fixture.name = 'synthetic.pdf'
    fixture.bytes = new Uint8Array(200_000)
  })

  it('errors a stalled reader and releases its slot and abort listener', async () => {
    vi.useFakeTimers()
    const abort = new AbortController()
    const remove = vi.spyOn(abort.signal, 'removeEventListener')
    const response = await downloadDocument(request(abort.signal), 1)
    const reader = response.body!.getReader()
    await reader.read()
    await vi.advanceTimersByTimeAsync(120_000)
    try {
      await expect(reader.read()).rejects.toThrow()
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await reader.cancel().catch(() => {})
    }
    const replacements = [
      await downloadDocument(request(), 1),
      await downloadDocument(request(), 1),
    ]
    await Promise.all(replacements.map((replacement) => replacement.body!.cancel()))
  })

  it('resets the idle deadline while a slow reader progresses and cleans up on end', async () => {
    vi.useFakeTimers()
    const response = await downloadDocument(request(), 1)
    const reader = response.body!.getReader()
    try {
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(90_000)
        expect((await reader.read()).value?.length).toBeGreaterThan(0)
      }
      expect((await reader.read()).done).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await reader.cancel().catch(() => {})
    }
  })

  it('errors a reader that never idles once the total delivery deadline passes', async () => {
    vi.useFakeTimers()
    fixture.bytes = new Uint8Array(64 * 1024 * 20)
    const abort = new AbortController()
    const remove = vi.spyOn(abort.signal, 'removeEventListener')
    const response = await downloadDocument(request(abort.signal), 1)
    const reader = response.body!.getReader()
    try {
      // Each read lands before the 120-second idle timeout; seven reads reach 630 seconds.
      for (let i = 0; i < 6; i++) {
        await vi.advanceTimersByTimeAsync(90_000)
        expect((await reader.read()).value?.length).toBeGreaterThan(0)
      }
      await vi.advanceTimersByTimeAsync(90_000)
      await expect(reader.read()).rejects.toThrow('Document delivery deadline exceeded')
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await reader.cancel().catch(() => {})
    }
    const replacements = [
      await downloadDocument(request(), 1),
      await downloadDocument(request(), 1),
    ]
    await Promise.all(replacements.map((replacement) => replacement.body!.cancel()))
  })

  it('copies chunks and clears the timer and abort listener on cancellation', async () => {
    vi.useFakeTimers()
    const abort = new AbortController()
    const remove = vi.spyOn(abort.signal, 'removeEventListener')
    const response = await downloadDocument(request(abort.signal), 1)
    const reader = response.body!.getReader()
    const chunk = (await reader.read()).value!
    await reader.cancel()
    expect(chunk.buffer).not.toBe(fixture.bytes.buffer)
    expect(chunk.buffer.byteLength).toBe(64 * 1024)
    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it.each([false, true])(
    'errors on abort (already aborted: %s) and clears the timer',
    async (early) => {
      vi.useFakeTimers()
      const abort = new AbortController()
      if (early) abort.abort()
      const response = await downloadDocument(request(abort.signal), 1)
      if (!early) abort.abort()
      try {
        await expect(response.body!.getReader().read()).rejects.toThrow()
        expect(vi.getTimerCount()).toBe(0)
        const release = [limits.acquireDocumentDeliverySlot(), limits.acquireDocumentDeliverySlot()]
        release.forEach((done) => done())
      } finally {
        await response.body!.cancel().catch(() => {})
      }
    },
  )

  it('normalizes legacy malformed Unicode and releases after Response construction failure', async () => {
    vi.useFakeTimers()
    fixture.name = 'bad\ud800.pdf'
    const response = await downloadDocument(request(), 1)
    expect(response.headers.get('Content-Disposition')).toContain('bad%EF%BF%BD.pdf')
    await response.body!.cancel()
    const NativeResponse = globalThis.Response
    vi.stubGlobal(
      'Response',
      class {
        constructor() {
          throw new Error('synthetic construction failure')
        }
      },
    )
    try {
      for (let i = 0; i < 3; i++)
        await expect(downloadDocument(request(), 1)).rejects.toThrow(
          'synthetic construction failure',
        )
    } finally {
      vi.stubGlobal('Response', NativeResponse)
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps delivery saturation separate from editorial verification capacity', async () => {
    const responses = [await downloadDocument(request(), 1), await downloadDocument(request(), 1)]
    try {
      await expect(downloadDocument(request(), 1)).rejects.toMatchObject({ status: 503 })
      const release = [limits.acquireDocumentSlot(), limits.acquireDocumentSlot()]
      release.forEach((done) => done())
    } finally {
      await Promise.all(responses.map((r) => r.body!.cancel()))
    }
  })
})
