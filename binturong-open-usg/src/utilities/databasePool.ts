import type { postgresAdapter } from '@payloadcms/db-postgres'

type PoolOptions = Parameters<typeof postgresAdapter>[0]['pool']

/**
 * node-postgres pool options, read from env only.
 *
 * Locally (no VERCEL) the pool is unchanged: just the connection string, pg's default size.
 * On Vercel each function instance keeps its own pool, so it defaults to 5 connections with a
 * short idle timeout; DATABASE_POOL_MAX overrides the size anywhere. DATABASE_SSL_CA (the
 * Supabase root certificate, PEM) turns on certificate-verified TLS; without it TLS follows
 * DATABASE_URL as before, so local Docker without SSL keeps working.
 */
export const databasePool = (
  env: Record<string, string | undefined> = process.env,
): PoolOptions => {
  const connectionString = env.DATABASE_URL || ''
  const pool: PoolOptions = { connectionString }

  const max = env.DATABASE_POOL_MAX?.trim()
  if (max) {
    if (!/^\d+$/.test(max) || Number(max) < 1 || Number(max) > 100)
      throw new Error('DATABASE_POOL_MAX must be a whole number from 1 to 100')
    pool.max = Number(max)
  } else if (env.VERCEL === '1') pool.max = 5

  if (env.VERCEL === '1') pool.idleTimeoutMillis = 5_000

  const ca = env.DATABASE_SSL_CA?.trim().replaceAll('\\n', '\n')
  if (ca) {
    // node-postgres lets sslmode/sslrootcert in the URL replace this ssl object entirely.
    if (/[?&](sslmode|sslrootcert)=/i.test(connectionString))
      throw new Error(
        'Remove sslmode and sslrootcert from DATABASE_URL when DATABASE_SSL_CA is set',
      )
    pool.ssl = { ca, rejectUnauthorized: true }
  }

  return pool
}
