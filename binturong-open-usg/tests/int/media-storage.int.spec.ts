import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildConfigWith } from '../helpers/freshConfig'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

// Synthetic values only; nothing here reaches a real storage service.
const mediaEnv = {
  MEDIA_S3_BUCKET: 'synthetic-media',
  MEDIA_S3_ENDPOINT: 'https://synthetic.example.test/storage/v1/s3',
  MEDIA_S3_REGION: 'synthetic-region-1',
  MEDIA_S3_ACCESS_KEY_ID: 'synthetic-access-key',
  MEDIA_S3_SECRET_ACCESS_KEY: 'synthetic-secret-key',
}
const unsetMedia = Object.fromEntries(Object.keys(mediaEnv).map((name) => [name, '']))
const clientHandler = '@payloadcms/storage-s3/client#S3ClientUploadHandler'

type Upload = { disableLocalStorage?: boolean; handlers?: unknown[]; staticDir?: string }
const uploadOf = (config: Awaited<ReturnType<typeof buildConfigWith>>, slug: string) => {
  const upload = config.collections.find((collection) => collection.slug === slug)?.upload
  return (typeof upload === 'object' ? upload : {}) as Upload
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('media storage', () => {
  it('keeps media on local disk when the cloud storage variables are unset', async () => {
    const config = await buildConfigWith(unsetMedia)
    const upload = uploadOf(config, 'media')
    expect(upload.disableLocalStorage).not.toBe(true)
    expect(upload.handlers ?? []).toHaveLength(0)
    expect(upload.staticDir).toContain('public')
    // The admin import map lists the adapter's client handler either way, so the import map
    // generated locally also matches a hosted build that has storage configured.
    expect(Object.keys(config.admin.dependencies ?? {})).toContain(clientHandler)
  }, 60_000)

  it('stores media in S3-compatible storage when every variable is set', async () => {
    const config = await buildConfigWith(mediaEnv)
    const upload = uploadOf(config, 'media')
    expect(upload.disableLocalStorage).toBe(true)
    expect(upload.handlers?.length).toBeGreaterThan(0)
    expect(Object.keys(config.admin.dependencies ?? {})).toContain(clientHandler)
    // Only media uses the adapter; official documents keep their own storage.
    for (const { slug } of config.collections.filter(({ slug }) => slug !== 'media'))
      expect(uploadOf(config, slug).handlers ?? [], slug).toHaveLength(0)
  }, 60_000)

  it('refuses a partial or malformed configuration instead of silently using local disk', async () => {
    await expect(
      buildConfigWith({ ...unsetMedia, MEDIA_S3_BUCKET: 'synthetic-media' }),
    ).rejects.toThrow(/MEDIA_S3_ENDPOINT/)
    await expect(buildConfigWith({ ...mediaEnv, MEDIA_S3_ENDPOINT: 'not a url' })).rejects.toThrow(
      /MEDIA_S3_ENDPOINT/,
    )
  }, 60_000)
})
