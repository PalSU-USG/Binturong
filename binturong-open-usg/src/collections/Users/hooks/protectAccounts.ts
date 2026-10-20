import {
  APIError,
  type Access,
  type AccessResult,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeLoginHook,
  type CollectionBeforeOperationHook,
  type PayloadRequest,
} from 'payload'

import { getActiveAccount } from '@/access/activeAccount'
import { canManageRole, hasRole } from '@/access/roles'
import type { User } from '@/payload-types'
import { isAccountProvisioning, lockAccounts } from '../accountProvisioning'

const forbidden = () => new APIError('You do not have permission to manage this account', 403)
const recoveryWrites = new WeakSet<PayloadRequest>()

export const readAccounts: Access = async ({ req }): Promise<AccessResult> => {
  const actor = await getActiveAccount(req)
  if (!actor) return false
  if (actor.role === 'super_admin') return true
  if (actor.role === 'admin') {
    return { or: [{ id: { equals: actor.id } }, { role: { in: ['editor', 'publisher'] } }] }
  }
  return { id: { equals: actor.id } }
}

export async function createAccounts({ req }: { req: PayloadRequest }): Promise<boolean> {
  const actor = await getActiveAccount(req)
  return !!actor && hasRole(actor.role, 'admin')
}

export const deleteAccounts: Access = async ({ req }) => {
  const actor = await getActiveAccount(req)
  if (!actor || !hasRole(actor.role, 'admin')) return false
  return actor.role === 'super_admin' ? true : { role: { in: ['editor', 'publisher'] } }
}

async function authorizeChange(
  req: PayloadRequest,
  data: { role?: unknown; disabled?: unknown },
  target?: User,
) {
  if (isAccountProvisioning(req)) return
  const actor = await getActiveAccount(req)
  if (!actor) throw forbidden()
  if (data.disabled !== undefined && typeof data.disabled !== 'boolean') throw forbidden()
  const desiredRole = data.role === undefined ? (target?.role ?? 'editor') : data.role
  if (!hasRole(desiredRole, 'editor')) throw forbidden()
  if (target && actor.id === target.id) {
    const roleChanged = data.role !== undefined && data.role !== target.role
    const statusChanged = data.disabled !== undefined && data.disabled !== target.disabled
    if (!roleChanged && !statusChanged) return
  }
  if (
    !canManageRole(actor.role, target?.role ?? desiredRole) ||
    !canManageRole(actor.role, desiredRole)
  ) {
    throw forbidden()
  }
}

async function protectLastSuperAdmin(req: PayloadRequest, target: User, data?: Partial<User>) {
  if (isAccountProvisioning(req)) return
  if (
    target.role !== 'super_admin' ||
    target.disabled ||
    (data && (data.role ?? target.role) === 'super_admin' && !data.disabled)
  ) {
    return
  }
  const { totalDocs } = await req.payload.count({
    collection: 'users',
    where: { and: [{ role: { equals: 'super_admin' } }, { disabled: { equals: false } }] },
    overrideAccess: true,
    req,
  })
  if (totalDocs <= 1) throw new APIError('Keep at least one active super-admin', 409)
}

export const protectAccountOperation: CollectionBeforeOperationHook<'users'> = async ({
  args,
  operation,
  overrideAccess,
  req,
}) => {
  if (operation === 'resetPassword') await lockAccounts(req)
  if (operation === 'refresh' && !(await getActiveAccount(req))) throw forbidden()
  if (operation !== 'create' && operation !== 'update' && operation !== 'delete') return
  const id = 'id' in args ? args.id : undefined
  if (operation !== 'create' && ((typeof id !== 'number' && typeof id !== 'string') || !id)) {
    throw new APIError('Bulk account changes are not supported', 400)
  }
  await lockAccounts(req)
  if (isAccountProvisioning(req)) return
  const data = 'data' in args ? (args.data ?? {}) : {}
  if (
    'authRevision' in data &&
    !(operation === 'create' && req.payloadAPI === 'local' && data.authRevision === 0)
  ) {
    throw forbidden()
  }
  // Payload recovery performs this privileged token-only update internally.
  if (
    operation === 'update' &&
    overrideAccess === true &&
    Object.keys(data).length === 2 &&
    'resetPasswordToken' in data &&
    typeof data.resetPasswordToken === 'string' &&
    'resetPasswordExpiration' in data &&
    typeof data.resetPasswordExpiration === 'string'
  ) {
    recoveryWrites.add(req)
    return
  }
  if (
    data &&
    [
      'sessions',
      'hash',
      'salt',
      'resetPasswordToken',
      'resetPasswordExpiration',
      'loginAttempts',
      'lockUntil',
      '_verified',
    ].some((key) => Object.prototype.hasOwnProperty.call(data, key))
  ) {
    throw forbidden()
  }
  const target =
    (typeof id === 'number' || typeof id === 'string') && id
      ? await req.payload.findByID({ collection: 'users', id, req, overrideAccess: true })
      : undefined
  if (operation === 'delete') {
    const actor = await getActiveAccount(req)
    if (!actor || !target || !canManageRole(actor.role, target.role)) throw forbidden()
  } else {
    await authorizeChange(req, data, target)
  }
}

export const protectAccountChange: CollectionBeforeChangeHook<User> = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  await lockAccounts(req)
  if (recoveryWrites.delete(req)) return data
  await authorizeChange(req, data, originalDoc)
  if (operation === 'update' && originalDoc) await protectLastSuperAdmin(req, originalDoc, data)
  if (data.disabled === true) data.sessions = []
  return data
}

export const protectAccountDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await lockAccounts(req)
  const target = await req.payload.findByID({ collection: 'users', id, req, overrideAccess: true })
  await protectLastSuperAdmin(req, target)
}

export const requireActiveLogin: CollectionBeforeLoginHook<User> = ({ user }) => {
  if (user.disabled !== false || !hasRole(user.role, 'editor')) throw forbidden()
  return user
}
