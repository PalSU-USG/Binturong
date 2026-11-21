import { randomBytes } from 'node:crypto'
import { createLocalReq, type Payload, type PayloadRequest } from 'payload'

import { hasRole } from '@/access/roles'

export async function createGoogleStaff(
  req: PayloadRequest,
  { email, name, role }: { email: string; name?: string | null; role: 'editor' | 'publisher' },
) {
  const local = await createLocalReq({ req: { ...req, payloadAPI: 'local' } }, req.payload)
  return req.payload.create({
    collection: 'users',
    data: {
      email,
      name,
      role,
      password: randomBytes(32).toString('base64url'),
      authRevision: 0,
      disabled: false,
    },
    overrideAccess: false,
    req: local,
  })
}

export async function findStaffAccount(payload: Payload, email: string, req?: PayloadRequest) {
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
    select: {
      email: true,
      name: true,
      role: true,
      disabled: true,
      authRevision: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  const account = docs[0]
  if (!account) return { status: 'unknown' } as const
  if (account.disabled !== false || !hasRole(account.role, 'editor'))
    return { status: 'disabled' } as const
  return { status: 'active', account } as const
}
