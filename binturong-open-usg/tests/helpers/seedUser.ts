import { createLocalReq, getPayload } from 'payload'
import config from '../../src/payload.config.js'
import { withAccountProvisioning } from '../../src/collections/Users/accountProvisioning'
import { removeTestAccounts } from './accessFixtures'

export const testUser = {
  email: 'dev@payloadcms.com',
  password: 'test',
}

export async function seedTestUser(): Promise<void> {
  await cleanupTestUser()
  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)
  await withAccountProvisioning(req, () =>
    payload.create({
      collection: 'users',
      data: { ...testUser, role: 'super_admin', disabled: false, authRevision: 0 },
      req,
    }),
  )
}

export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
    depth: 0,
  })
  await removeTestAccounts(
    payload,
    docs.map(({ id }) => id),
  )
}
