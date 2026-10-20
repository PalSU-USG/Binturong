import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, handleEndpoints, type Payload } from 'payload'

import config from '@/payload.config'
import type { User } from '@/payload-types'
import {
  createAccessFixtures,
  fixturePassword,
  removeTestAccounts,
} from '../helpers/accessFixtures'

describe('account authority', () => {
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
      ...Object.values(fixtures?.users ?? {}).map((user) => user.id),
    ])
  })

  function request(path: string, token?: string, method = 'GET', data?: unknown) {
    return handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `JWT ${token}` } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      }),
    })
  }

  it('allows_self_profile_edits_and_limits_account_reads', async () => {
    const editor = fixtures.users.editor
    const profile = await request(`/users/${editor.id}`, fixtures.tokens.editor, 'PATCH', {
      name: 'Synthetic revised profile',
    })
    expect(profile.status).toBe(200)
    const own = await request('/users?limit=100', fixtures.tokens.editor)
    expect((await own.json()).docs.map((user: User) => user.id)).toEqual([editor.id])
    const admin = await request('/users?limit=100', fixtures.tokens.admin)
    const visible: User[] = (await admin.json()).docs
    expect(visible.some((user) => user.id === editor.id)).toBe(true)
    expect(visible.some((user) => user.id === fixtures.users.super_admin.id)).toBe(false)
    expect((await request('/users')).status).toBe(403)
  })

  it('rejects_forged_role_status_sessions_and_context', async () => {
    for (const data of [
      { role: 'super_admin' },
      { authRevision: 0 },
      { disabled: true },
      { sessions: [{ id: randomUUID(), expiresAt: '2099-01-01' }] },
      { role: 'super_admin', context: { bootstrap: true, provisioning: true } },
    ]) {
      const response = await request(
        `/users/${fixtures.users.editor.id}`,
        fixtures.tokens.editor,
        'PATCH',
        data,
      )
      expect(response.status).toBe(403)
    }
    const stored = await payload.findByID({ collection: 'users', id: fixtures.users.editor.id })
    expect(stored).toMatchObject({ role: 'editor', disabled: false })
  })

  it('restricts_admin_targets_and_granted_roles', async () => {
    const actor = fixtures.tokens.admin
    const peer = await payload.create({
      collection: 'users',
      data: {
        email: `synthetic-peer-${randomUUID()}@example.invalid`,
        password: fixturePassword,
        role: 'admin',
        disabled: false,
        authRevision: 0,
      },
      user: { ...fixtures.users.super_admin, collection: 'users' },
      overrideAccess: false,
    })
    extraIDs.push(peer.id)
    for (const data of [
      { name: 'Denied peer edit' },
      { password: 'denied-peer-password' },
      { disabled: true },
    ]) {
      expect((await request(`/users/${peer.id}`, actor, 'PATCH', data)).status).toBe(403)
    }
    expect((await request(`/users/${peer.id}`, actor, 'DELETE')).status).toBe(403)
    for (const role of ['admin', 'super_admin'] as const) {
      const target = fixtures.users[role]
      expect(
        (await request(`/users/${target.id}`, actor, 'PATCH', { name: 'Forged' })).status,
      ).toBe(role === 'admin' ? 200 : 403)
      expect(
        (await request(`/users/${target.id}`, actor, 'PATCH', { disabled: true })).status,
      ).toBe(403)
      expect((await request(`/users/${target.id}`, actor, 'DELETE')).status).toBe(403)
      const created = await request('/users', actor, 'POST', {
        email: `synthetic-denied-${randomUUID()}@example.invalid`,
        password: fixturePassword,
        role,
      })
      if (created.status === 201) extraIDs.push((await created.json()).doc.id)
      expect(created.status).toBe(403)
    }
    expect(
      (await request(`/users/${fixtures.users.editor.id}`, actor, 'PATCH', { role: 'super_admin' }))
        .status,
    ).toBe(403)
    expect(
      (await request(`/users/${fixtures.users.editor.id}`, actor, 'PATCH', { role: 'publisher' }))
        .status,
    ).toBe(200)
  })

  it('allows_super_admin_management_and_revokes_existing_sessions', async () => {
    const created = await request('/users', fixtures.tokens.super_admin, 'POST', {
      email: `synthetic-managed-${randomUUID()}@example.invalid`,
      password: fixturePassword,
      role: 'admin',
    })
    expect(created.status).toBe(201)
    const { doc: account } = await created.json()
    extraIDs.push(account.id)
    const session = await payload.login({
      collection: 'users',
      data: { email: account.email, password: fixturePassword },
    })
    expect((await request('/users', session.token)).status).toBe(200)
    const disabled = await request(`/users/${account.id}`, fixtures.tokens.super_admin, 'PATCH', {
      disabled: true,
    })
    expect(disabled.status).toBe(200)
    expect((await request('/users', session.token)).status).toBe(403)
    expect((await request('/users/refresh-token', session.token, 'POST')).status).toBe(403)
    await expect(
      payload.login({
        collection: 'users',
        data: { email: account.email, password: fixturePassword },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('reloads_current_authority_instead_of_trusting_a_local_user_object', async () => {
    const stale = { ...fixtures.users.admin, collection: 'users' as const }
    await payload.update({
      collection: 'users',
      id: stale.id,
      data: { role: 'editor' },
      user: { ...fixtures.users.super_admin, collection: 'users' },
      overrideAccess: false,
    })
    await expect(
      payload
        .create({
          collection: 'users',
          data: {
            email: `synthetic-stale-${randomUUID()}@example.invalid`,
            password: fixturePassword,
            role: 'publisher',
            disabled: false,
            authRevision: 0,
          },
          user: stale,
          overrideAccess: false,
        })
        .then((user) => {
          extraIDs.push(user.id)
          return user
        }),
    ).rejects.toMatchObject({ status: 403 })
    expect(
      (
        await request('/users', fixtures.tokens.admin, 'POST', {
          email: `synthetic-stale-jwt-${randomUUID()}@example.invalid`,
          password: fixturePassword,
        })
      ).status,
    ).toBe(403)
    const req = await createLocalReq({ user: stale }, payload)
    const { getActiveAccount } = await import('@/access/activeAccount')
    expect(await getActiveAccount(req)).toMatchObject({ role: 'editor', disabled: false })
  })

  it('rejects_bulk_account_writes_and_preserves_the_last_super_admin', async () => {
    const scope = `/users?where[id][in]=${Object.values(fixtures.users)
      .map((user) => user.id)
      .join(',')}`
    expect(
      (
        await request(scope, fixtures.tokens.super_admin, 'PATCH', {
          disabled: true,
        })
      ).status,
    ).toBe(400)
    expect((await request(scope, fixtures.tokens.super_admin, 'DELETE')).status).toBe(400)
    const id = fixtures.users.super_admin.id
    for (const data of [{ role: 'admin' }, { disabled: true }]) {
      expect(
        (await request(`/users/${id}`, fixtures.tokens.super_admin, 'PATCH', data)).status,
      ).toBe(409)
    }
    expect((await request(`/users/${id}`, fixtures.tokens.super_admin, 'DELETE')).status).toBe(409)
    expect(await payload.findByID({ collection: 'users', id })).toMatchObject({
      role: 'super_admin',
      disabled: false,
    })
  })
})
