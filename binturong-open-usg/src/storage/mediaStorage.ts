import { s3Storage } from '@payloadcms/storage-s3'
import type { Plugin } from 'payload'

const variables = [
  'MEDIA_S3_BUCKET',
  'MEDIA_S3_ENDPOINT',
  'MEDIA_S3_REGION',
  'MEDIA_S3_ACCESS_KEY_ID',
  'MEDIA_S3_SECRET_ACCESS_KEY',
] as const

/**
 * Media files go to an S3-compatible bucket (Supabase Storage on hosted) only when every
 * MEDIA_S3_* variable is set; with none set they stay on local disk, so tests run offline.
 * A partial setup fails the config instead of silently writing to Vercel's temporary disk.
 *
 * The plugin is registered even when disabled so the admin import map is the same everywhere.
 * Files are still served through Payload's `/api/media/file/...` route (access control kept),
 * so the bucket does not need to be public and next/image needs no remote pattern.
 */
export const mediaStorage = (env: Record<string, string | undefined> = process.env): Plugin => {
  const value = (name: (typeof variables)[number]) => env[name]?.trim() || undefined
  const missing = variables.filter((name) => !value(name))
  const enabled = missing.length === 0
  if (!enabled && missing.length < variables.length)
    throw new Error(`Media storage is partly configured; also set ${missing.join(', ')}`)

  const endpoint = value('MEDIA_S3_ENDPOINT')
  if (endpoint && !URL.canParse(endpoint))
    throw new Error(
      'MEDIA_S3_ENDPOINT must be a full URL, such as https://<ref>.storage.supabase.co/storage/v1/s3',
    )

  return s3Storage({
    enabled,
    collections: { media: true },
    bucket: value('MEDIA_S3_BUCKET') ?? '',
    config: {
      endpoint,
      region: value('MEDIA_S3_REGION'),
      // Supabase's S3 endpoint addresses buckets by path, not by subdomain.
      forcePathStyle: true,
      credentials: {
        accessKeyId: value('MEDIA_S3_ACCESS_KEY_ID') ?? '',
        secretAccessKey: value('MEDIA_S3_SECRET_ACCESS_KEY') ?? '',
      },
    },
  })
}
