import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

// Supabase's Data API (PostgREST) serves schema public as anon/authenticated. Binturong never
// uses it; Payload connects as the table owner. These checks keep every public table closed.
describe('Supabase Data API lockdown', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('enables row level security on every public table', async () => {
    const { rows } = await payload.db.pool.query(
      "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity order by 1",
    )
    expect(rows.map(({ relname }) => relname)).toEqual([])
  })

  for (const role of ['anon', 'authenticated']) {
    it(`denies ${role} reads and writes with a permission error`, async () => {
      const { rows } = await payload.db.pool.query(
        "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') order by 1",
        [role],
      )
      expect(rows.map(({ relname }) => relname)).toEqual([])
      const client = await payload.db.pool.connect()
      try {
        for (const statement of [
          'select * from users',
          "insert into categories (title) values ('Denied')",
        ]) {
          await client.query('begin')
          try {
            await client.query(`set local role "${role}"`)
            await expect(client.query(statement)).rejects.toMatchObject({
              code: '42501',
              message: expect.stringMatching(/^permission denied/),
            })
          } finally {
            await client.query('rollback')
          }
        }
      } finally {
        client.release()
      }
    })
  }

  it('keeps Payload reads and writes working as the table owner', async () => {
    expect((await payload.find({ collection: 'users', limit: 1 })).docs).toBeInstanceOf(Array)
    const id = randomUUID()
    const title = `Synthetic lockdown topic ${id}`
    const created = await payload.create({
      collection: 'categories',
      data: { title, slug: `synthetic-lockdown-${id}` },
    })
    try {
      expect((await payload.findByID({ collection: 'categories', id: created.id })).title).toBe(
        title,
      )
    } finally {
      await payload.delete({ collection: 'categories', id: created.id })
    }
  })
})
