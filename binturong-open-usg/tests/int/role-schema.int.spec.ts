import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, handleEndpoints, type Payload } from 'payload'

import config from '@/payload.config'
import type { User } from '@/payload-types'
import { withAccountProvisioning } from '@/collections/Users/accountProvisioning'
import { removeTestAccounts } from '../helpers/accessFixtures'

describe('account schema defaults', () => {
  let payload: Payload
  const userIDs: User['id'][] = []

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await removeTestAccounts(payload, userIDs)
  })

  async function createSyntheticUser(role: User['role'] = 'editor') {
    const email = `synthetic-role-${randomUUID()}@example.invalid`
    const password = 'synthetic-role-default-password'
    const req = await createLocalReq({}, payload)
    const user = await withAccountProvisioning(req, () =>
      payload.create({
        collection: 'users',
        req,
        data: {
          email,
          password,
          name: 'Synthetic role defaults',
          role,
          disabled: false,
          authRevision: 0,
        },
      }),
    )
    userIDs.push(user.id)
    return { user, email, password }
  }

  it('creates_an_editor_without_changing_the_password', async () => {
    const manager = await createSyntheticUser('super_admin')
    const session = await payload.login({
      collection: 'users',
      data: { email: manager.email, password: manager.password },
    })
    const email = `synthetic-defaults-${randomUUID()}@example.invalid`
    const password = 'synthetic-defaults-password'
    const response = await handleEndpoints({
      config,
      request: new Request('http://127.0.0.1:3003/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${session.token}` },
        body: JSON.stringify({ email, password, name: 'Synthetic REST defaults' }),
      }),
    })
    expect(response.status).toBe(201)
    const { doc: user } = await response.json()
    userIDs.push(user.id)
    expect(user).toMatchObject({ role: 'editor', disabled: false })
    const login = await payload.login({ collection: 'users', data: { email, password } })
    expect(login.user?.id).toBe(user.id)
  })

  it('keeps_role_and_status_server_controlled_on_profile_writes', async () => {
    const { user } = await createSyntheticUser()
    const actor = { ...user, collection: 'users' as const }
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { name: 'Synthetic edited profile' },
      user: actor,
      overrideAccess: false,
    })

    try {
      await payload.update({
        collection: 'users',
        id: user.id,
        data: { role: 'super_admin', disabled: true },
        user: actor,
        overrideAccess: false,
      })
    } catch (error) {
      expect(error).toMatchObject({ status: 403 })
    }

    const stored = await payload.findByID({ collection: 'users', id: user.id })
    expect(stored).toMatchObject({
      role: 'editor',
      disabled: false,
      name: 'Synthetic edited profile',
    })
  })
})
