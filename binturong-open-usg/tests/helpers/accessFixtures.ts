import { randomUUID } from 'node:crypto'
import { createLocalReq, type Payload } from 'payload'

import { userRoles, type UserRole } from '@/access/roles'
import type { User } from '@/payload-types'
import { withAccountProvisioning } from '@/collections/Users/accountProvisioning'

export const fixturePassword = 'synthetic-access-password'

export async function createAccessFixtures(payload: Payload) {
  const entries = await Promise.all(
    userRoles.map(async (role) => {
      const req = await createLocalReq({}, payload)
      const user = await withAccountProvisioning(req, () =>
        payload.create({
          collection: 'users',
          req,
          data: {
            email: `synthetic-${role}-${randomUUID()}@example.invalid`,
            password: fixturePassword,
            name: `Synthetic ${role}`,
            role,
            disabled: false,
            authRevision: 0,
          },
        }),
      )
      const session = await payload.login({
        collection: 'users',
        data: { email: user.email, password: fixturePassword },
      })
      return [role, { user, token: session.token! }] as const
    }),
  )
  return {
    users: Object.fromEntries(entries.map(([role, { user }]) => [role, user])) as Record<
      UserRole,
      User
    >,
    tokens: Object.fromEntries(entries.map(([role, { token }]) => [role, token])) as Record<
      UserRole,
      string
    >,
  }
}

export async function removeTestAccounts(payload: Payload, ids: User['id'][]): Promise<void> {
  const req = await createLocalReq({}, payload)
  await withAccountProvisioning(req, async () => {
    for (const id of ids) {
      const existing = await payload.findByID({ collection: 'users', id, disableErrors: true, req })
      if (existing) await payload.delete({ collection: 'users', id, req })
    }
  })
}
