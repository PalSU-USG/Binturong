import { afterEach, describe, expect, it, vi } from 'vitest'

import { databasePool } from '@/utilities/databasePool'
import { buildConfigWith } from '../helpers/freshConfig'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

// Synthetic connection string; these tests never open a connection.
const url = 'postgresql://synthetic:synthetic@127.0.0.1:45323/binturong_test'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('database pool', () => {
  it('leaves local connections unchanged', () => {
    expect(databasePool({ DATABASE_URL: url })).toEqual({ connectionString: url })
    expect(databasePool({})).toEqual({ connectionString: '' })
  })

  it('uses a small pool with a short idle timeout on Vercel', () => {
    expect(databasePool({ DATABASE_URL: url, VERCEL: '1' })).toEqual({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 5_000,
    })
    expect(databasePool({ DATABASE_URL: url, VERCEL: '1', DATABASE_POOL_MAX: '3' })).toMatchObject({
      max: 3,
    })
    expect(databasePool({ DATABASE_URL: url, DATABASE_POOL_MAX: '2' })).toEqual({
      connectionString: url,
      max: 2,
    })
  })

  it('rejects a pool size that is not a whole number from 1 to 100', () => {
    for (const value of ['0', '-1', '2.5', 'abc', '101', '5x', '1e1'])
      expect(() => databasePool({ DATABASE_URL: url, DATABASE_POOL_MAX: value }), value).toThrow(
        /DATABASE_POOL_MAX/,
      )
  })

  it('verifies the server certificate when a CA is supplied', () => {
    const ca = '-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----'
    expect(databasePool({ DATABASE_URL: url, DATABASE_SSL_CA: ca })).toEqual({
      connectionString: url,
      ssl: { ca, rejectUnauthorized: true },
    })
    // Env UIs often store a PEM with literal \n; it must still reach pg as real line breaks.
    expect(
      databasePool({ DATABASE_URL: url, DATABASE_SSL_CA: ca.replaceAll('\n', '\\n') }).ssl,
    ).toEqual({ ca, rejectUnauthorized: true })
    for (const query of [
      '?sslmode=require',
      '?sslrootcert=x',
      '?sslcert=x',
      '?sslkey=x',
      '?sslnegotiation=direct',
      '?ssl=0',
      '?%73slmode=disable',
    ])
      expect(() => databasePool({ DATABASE_URL: `${url}${query}`, DATABASE_SSL_CA: ca })).toThrow(
        /DATABASE_SSL_CA/,
      )
  })

  it('passes the pool options to the Postgres adapter', async () => {
    const config = await buildConfigWith({ VERCEL: '1', DATABASE_POOL_MAX: '4' })
    const adapter = config.db.init({ payload: {} as never }) as unknown as {
      poolOptions?: Record<string, unknown>
    }
    expect(adapter.poolOptions).toMatchObject({ max: 4, idleTimeoutMillis: 5_000 })
  }, 60_000)

  it('reports a malformed database URL without including the input', () => {
    const connectionString = 'postgresql://synthetic:synthetic-secret@['
    expect(() => databasePool({ DATABASE_URL: connectionString, DATABASE_SSL_CA: 'CA' })).toThrow(
      'DATABASE_URL must be a valid URL when DATABASE_SSL_CA is set',
    )
  })
})
