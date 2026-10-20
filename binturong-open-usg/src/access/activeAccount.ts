import type { PayloadRequest } from 'payload'

import type { User } from '@/payload-types'
import { hasRole } from './roles'

export async function getActiveAccount(
  req: PayloadRequest,
): Promise<Pick<User, 'id' | 'role' | 'disabled'> | null> {
  const id = req.user?.id
  if (req.user?.collection !== 'users' || !Number.isSafeInteger(id) || !id || id < 1) return null

  const { docs } = await req.payload.find({
    collection: 'users',
    where: { id: { equals: id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
    select: { role: true, disabled: true },
  })
  const account = docs[0]
  return account?.disabled === false && hasRole(account.role, 'editor')
    ? { id: account.id, role: account.role, disabled: account.disabled }
    : null
}
