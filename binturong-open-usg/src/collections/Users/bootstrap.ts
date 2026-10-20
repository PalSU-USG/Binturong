import { APIError, type PayloadRequest } from 'payload'

import {
  assertLocalAccountDatabase,
  lockAccounts,
  withAccountProvisioning,
} from './accountProvisioning'

export async function bootstrapSuperAdmin(req: PayloadRequest, userID: number): Promise<void> {
  assertLocalAccountDatabase()
  if (!Number.isSafeInteger(userID) || userID < 1)
    throw new APIError('Choose an existing account ID', 400)
  await lockAccounts(req)
  const account = await req.payload.findByID({
    collection: 'users',
    id: userID,
    req,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!account || account.disabled !== false)
    throw new APIError('Choose an existing active account', 400)
  if (account.role === 'super_admin') return
  const { totalDocs } = await req.payload.count({
    collection: 'users',
    req,
    overrideAccess: true,
    where: { and: [{ role: { equals: 'super_admin' } }, { disabled: { equals: false } }] },
  })
  if (totalDocs > 0)
    throw new APIError('An active super-admin already exists; use account management', 409)
  await withAccountProvisioning(req, () =>
    req.payload.update({
      collection: 'users',
      id: userID,
      data: { role: 'super_admin' },
      req,
      overrideAccess: true,
    }),
  )
}
