import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, handleEndpoints, type Payload } from 'payload'
import { GRAPHQL_POST } from '@payloadcms/next/routes'

import config from '@/payload.config'
import {
  createAccessFixtures,
  fixturePassword,
  removeTestAccounts,
} from '../helpers/accessFixtures'

describe('native account authentication', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })

  afterAll(async () => {
    await removeTestAccounts(
      payload,
      Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    )
  })

  it('preserves_native_password_recovery_without_accepting_client_reset_fields', async () => {
    const account = fixtures.users.editor
    const token = await payload.forgotPassword({
      collection: 'users',
      data: { email: account.email },
      disableEmail: true,
    })
    if (!token) throw new Error('Expected a synthetic password-reset token')
    const password = 'synthetic-recovered-password'
    await payload.resetPassword({
      collection: 'users',
      data: { token, password },
      overrideAccess: false,
    })
    const login = await payload.login({
      collection: 'users',
      data: { email: account.email, password },
    })
    expect(login.user?.id).toBe(account.id)
    const forged = await handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api/users/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${login.token}` },
        body: JSON.stringify({
          resetPasswordToken: 'synthetic-forged-token',
          resetPasswordExpiration: '2099-01-01',
        }),
      }),
    })
    expect(forged.status).toBe(403)
  })

  it('prevents_admins_from_unlocking_super_admins', async () => {
    const account = fixtures.users.super_admin
    const lockUntil = '2099-01-01T00:00:00.000Z'
    await payload.db.updateOne({
      collection: 'users',
      id: account.id,
      data: { loginAttempts: 5, lockUntil },
    })
    try {
      const response = await handleEndpoints({
        config,
        request: new Request('http://127.0.0.1:3003/api/users/unlock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `JWT ${fixtures.tokens.admin}`,
          },
          body: JSON.stringify({ email: account.email }),
        }),
      })
      expect(response.status).toBe(403)
      const stored = await payload.findByID({
        collection: 'users',
        id: account.id,
        showHiddenFields: true,
      })
      expect(stored?.lockUntil).toBe(lockUntil)
    } finally {
      await payload.db.updateOne({
        collection: 'users',
        id: account.id,
        data: { loginAttempts: 0, lockUntil: null },
      })
    }
  })

  for (const data of [
    { disabled: true },
    { role: 'editor' as const },
    { password: 'synthetic-race-new-password' },
    { disabled: true, reenable: true },
  ]) {
    it(`rejects_stale_native_login_writes_after_${data.reenable ? 'disable_reenable' : data.disabled ? 'disable' : data.password ? 'password_change' : 'demotion'}`, async () => {
      const account = fixtures.users.publisher
      let paused = false
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const original = payload.db.updateOne.bind(payload.db)
      const spy = vi.spyOn(payload.db, 'updateOne').mockImplementation(async (args) => {
        if (
          !paused &&
          args.collection === 'users' &&
          args.id === account.id &&
          args.data?.email === account.email &&
          Array.isArray(args.data?.sessions)
        ) {
          paused = true
          await gate
        }
        return original(args)
      })
      const sessionsBefore = Object.keys(payload.db.sessions ?? {}).length
      const login = payload
        .login({ collection: 'users', data: { email: account.email, password: fixturePassword } })
        .then(
          () => 'fulfilled',
          () => 'rejected',
        )
      try {
        await vi.waitFor(() => expect(paused).toBe(true), { timeout: 5000, interval: 10 })
        await payload.update({
          collection: 'users',
          id: account.id,
          data,
          user: { ...fixtures.users.super_admin, collection: 'users' },
          overrideAccess: false,
        })
        if (data.reenable) {
          await payload.update({
            collection: 'users',
            id: account.id,
            data: { disabled: false },
            user: { ...fixtures.users.super_admin, collection: 'users' },
            overrideAccess: false,
          })
        }
        release()
        expect(await login).toBe('rejected')
        const stored = await payload.findByID({ collection: 'users', id: account.id })
        if (data.password) {
          const freshLogin = await payload.login({
            collection: 'users',
            data: { email: account.email, password: data.password },
          })
          expect(freshLogin.user?.id).toBe(account.id)
        } else if (!data.reenable) {
          expect(stored).toMatchObject(data)
        }
        if (data.disabled) expect(stored.sessions).toEqual([])
        expect(Object.keys(payload.db.sessions ?? {}).length).toBe(sessionsBefore)
        await payload.update({
          collection: 'users',
          id: account.id,
          data: {
            role: 'publisher',
            disabled: false,
            ...(data.password ? { password: fixturePassword } : {}),
          },
          user: { ...fixtures.users.super_admin, collection: 'users' },
          overrideAccess: false,
        })
      } finally {
        release()
        await login
        spy.mockRestore()
      }
    })
  }

  it('enforces_account_scope_through_the_real_graphql_handler', async () => {
    const response = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.admin}`,
        },
        body: JSON.stringify({
          query: `query { Users(where: { id: { equals: ${fixtures.users.super_admin.id} } }) { docs { id email } } }`,
        }),
      }),
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.errors).toBeUndefined()
    expect(body.data.Users.docs).toEqual([])
    const denied = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:
            'mutation { createUser(data: { email: "synthetic-public@example.invalid", password: "synthetic-password", role: super_admin, disabled: false }) { id } }',
        }),
      }),
    )
    const result = await denied.json()
    expect(result.errors?.[0]?.extensions.statusCode).toBe(403)
  })
})
