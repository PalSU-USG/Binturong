import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  commitTransaction,
  createLocalReq,
  getPayload,
  initTransaction,
  killTransaction,
  registerFirstUserOperation,
  type Payload,
} from 'payload'

import config from '@/payload.config'
import { lockAccounts } from '@/collections/Users/accountProvisioning'
import type { User } from '@/payload-types'
import {
  createAccessFixtures,
  fixturePassword,
  removeTestAccounts,
} from '../helpers/accessFixtures'

describe('account transactions', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const extraIDs: User['id'][] = []

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })

  afterAll(async () => {
    await removeTestAccounts(payload, [
      ...extraIDs,
      ...Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    ])
  })

  async function secondSuperAdmin() {
    const user = await payload.create({
      collection: 'users',
      data: {
        email: `synthetic-concurrency-${randomUUID()}@example.invalid`,
        password: fixturePassword,
        role: 'super_admin',
        disabled: false,
        authRevision: 0,
      },
      user: { ...fixtures.users.super_admin, collection: 'users' },
      overrideAccess: false,
    })
    extraIDs.push(user.id)
    return { ...user, collection: 'users' as const }
  }

  async function observeBlockedAccountWrite() {
    await vi.waitFor(
      async () => {
        const { rows } = await payload.db.pool.query(
          "select pid from pg_locks where locktype = 'advisory' and classid = 20261020 and objid = 1 and not granted",
        )
        expect(rows.length).toBeGreaterThan(0)
      },
      { timeout: 5000, interval: 10 },
    )
  }

  for (const operation of ['demote', 'delete'] as const) {
    it(`serializes_concurrent_${operation}_attempts_and_rechecks_the_actor`, async () => {
      const survivor = { ...fixtures.users.super_admin, collection: 'users' as const }
      const other = await secondSuperAdmin()
      const firstReq = await createLocalReq({ user: survivor }, payload)
      await initTransaction(firstReq)
      await lockAccounts(firstReq)
      const losingWrite = (
        operation === 'delete'
          ? payload.delete({
              collection: 'users',
              id: survivor.id,
              user: other,
              overrideAccess: false,
            })
          : payload.update({
              collection: 'users',
              id: survivor.id,
              data: { role: 'editor' },
              user: other,
              overrideAccess: false,
            })
      ).then(
        () => null,
        (error: unknown) => error,
      )
      try {
        await observeBlockedAccountWrite()
        if (operation === 'delete') {
          await payload.delete({
            collection: 'users',
            id: other.id,
            req: firstReq,
            overrideAccess: false,
          })
        } else {
          await payload.update({
            collection: 'users',
            id: other.id,
            data: { role: 'editor' },
            req: firstReq,
            overrideAccess: false,
          })
        }
        await commitTransaction(firstReq)
      } finally {
        await killTransaction(firstReq)
      }
      expect(await losingWrite).toMatchObject({ status: 403 })
      expect(await payload.findByID({ collection: 'users', id: survivor.id })).toMatchObject({
        role: 'super_admin',
        disabled: false,
      })
      const { totalDocs } = await payload.count({
        collection: 'users',
        where: { and: [{ role: { equals: 'super_admin' } }, { disabled: { equals: false } }] },
      })
      expect(totalDocs).toBe(1)
    })
  }

  it('rolls_back_a_post_write_failure_and_allows_a_retry', async () => {
    const target = fixtures.users.editor
    const hooks = payload.collections.users.config.hooks.afterChange
    const failAfterWrite = () => {
      throw new Error('Synthetic account write failure')
    }
    hooks.push(failAfterWrite)
    try {
      await expect(
        payload.update({
          collection: 'users',
          id: target.id,
          data: { role: 'publisher' },
          user: { ...fixtures.users.super_admin, collection: 'users' },
          overrideAccess: false,
        }),
      ).rejects.toThrow('Synthetic account write failure')
    } finally {
      hooks.splice(hooks.indexOf(failAfterWrite), 1)
    }
    expect(await payload.findByID({ collection: 'users', id: target.id })).toMatchObject({
      role: 'editor',
    })
    const retried = await payload.update({
      collection: 'users',
      id: target.id,
      data: { role: 'publisher' },
      user: { ...fixtures.users.super_admin, collection: 'users' },
      overrideAccess: false,
    })
    expect(retried.role).toBe('publisher')
  })

  it('blocks_native_first_registration_even_with_an_empty_database', async () => {
    const before = await payload.count({ collection: 'users' })
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    try {
      await payload.db.deleteMany({ collection: 'users', req, where: {} })
      expect((await payload.count({ collection: 'users', req })).totalDocs).toBe(0)
      await expect(
        registerFirstUserOperation({
          collection: payload.collections.users,
          data: {
            email: `synthetic-first-${randomUUID()}@example.invalid`,
            password: fixturePassword,
            role: 'super_admin',
            disabled: false,
            authRevision: 0,
          },
          req,
        }),
      ).rejects.toMatchObject({ status: 403 })
    } finally {
      await killTransaction(req)
    }
    expect((await payload.count({ collection: 'users' })).totalDocs).toBe(before.totalDocs)
  })

  it('fails_closed_without_a_transaction', async () => {
    const req = await createLocalReq({}, payload)
    await expect(lockAccounts(req)).rejects.toMatchObject({ status: 500 })
    await expect(
      payload.update({
        collection: 'users',
        id: fixtures.users.editor.id,
        data: { role: 'admin' },
        user: { ...fixtures.users.super_admin, collection: 'users' },
        overrideAccess: false,
        disableTransaction: true,
      }),
    ).rejects.toMatchObject({ status: 500 })
  })
})
