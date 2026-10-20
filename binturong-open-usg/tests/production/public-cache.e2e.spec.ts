import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import { assertTestDatabase } from '../helpers/assertTestDatabase'
import { syntheticContent } from '../helpers/contentFixtures'
import type { Post } from '../../src/payload-types'

test('withdrawal cannot leave warmed public output after an open-transaction refill', async ({
  request,
}) => {
  assertTestDatabase(process.env.DATABASE_URL)
  const payload = await getPayload({ config })
  const fixtures = await createAccessFixtures(payload)
  const created = await request.post('/api/posts', {
    headers: { Authorization: `JWT ${fixtures.tokens.publisher}` },
    data: {
      title: `Synthetic cache ${randomUUID()}`,
      slug: `synthetic-${randomUUID()}`,
      content: syntheticContent,
      _status: 'published',
    },
  })
  expect(created.ok()).toBe(true)
  const doc: Post = (await created.json()).doc
  const blocker = await payload.db.pool.connect()
  let withdrawal: Promise<unknown> | undefined
  try {
    for (const path of ['/posts', '/posts-sitemap.xml']) {
      const response = await request.get(path)
      expect(response.ok()).toBe(true)
      expect(
        (await response.text()).includes(path === '/posts' ? doc.title : doc.slug!),
        path,
      ).toBe(true)
    }
    await blocker.query('select pg_advisory_lock(20261020, 6)')
    // This disposable deferred trigger pauses COMMIT after native revalidation hooks ran.
    await payload.db.pool.query(`
      create function binturong_test_withdrawal_barrier() returns trigger language plpgsql as $$
      begin
        if new.id = ${doc.id} and new._status = 'draft' then
          perform pg_advisory_xact_lock(20261020, 6);
        end if;
        return new;
      end $$;
      create constraint trigger binturong_test_withdrawal_barrier
      after update on posts deferrable initially deferred
      for each row execute function binturong_test_withdrawal_barrier();
    `)
    withdrawal = request
      .patch(`/api/posts/${doc.id}`, {
        headers: { Authorization: `JWT ${fixtures.tokens.publisher}` },
        data: { _status: 'draft' },
        timeout: 60000,
      })
      .then(async (response) => {
        expect(response.ok()).toBe(true)
      })
    await expect
      .poll(
        async () => {
          const result = await payload.db.pool.query(
            "select pid from pg_locks where locktype='advisory' and classid=20261020 and objid=6 and not granted",
          )
          return result.rows.length
        },
        { timeout: 15000 },
      )
      .toBeGreaterThan(0)
    for (const path of ['/posts', '/posts-sitemap.xml']) {
      const response = await request.get(path)
      expect(
        (await response.text()).includes(path === '/posts' ? doc.title : doc.slug!),
        path,
      ).toBe(true)
    }
    await blocker.query('select pg_advisory_unlock(20261020, 6)')
    await withdrawal
    expect((await request.get(`/api/posts/${doc.id}`)).status()).toBe(404)
    for (const path of ['/posts', '/posts-sitemap.xml', `/posts/${doc.slug}`]) {
      const response = await request.get(path)
      expect(
        (await response.text()).includes(path === '/posts-sitemap.xml' ? doc.slug! : doc.title),
        path,
      ).toBe(false)
    }
  } finally {
    await blocker.query('select pg_advisory_unlock(20261020, 6)')
    if (withdrawal) await withdrawal.catch(() => {})
    await payload.db.pool.query(
      'drop trigger if exists binturong_test_withdrawal_barrier on posts; drop function if exists binturong_test_withdrawal_barrier();',
    )
    blocker.release()
    await payload.delete({ collection: 'posts', id: doc.id, context: { disableRevalidate: true } })
    await removeTestAccounts(
      payload,
      Object.values(fixtures.users).map(({ id }) => id),
    )
  }
})
