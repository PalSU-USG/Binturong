import { APIError, type CollectionBeforeOperationHook } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { getActiveAccount } from '@/access/activeAccount'
import { hasRole } from '@/access/roles'
import { lockAccounts } from '@/collections/Users/accountProvisioning'

export async function enforceEditorialWrites({
  args,
  operation,
  overrideAccess,
  req,
}: Parameters<CollectionBeforeOperationHook>[0]): Promise<void> {
  if (!['create', 'update', 'delete', 'restoreVersion'].includes(operation)) return
  // Share the authority lock with scheduling, including draft autosaves and native bulk writes.
  await lockAccounts(req)
  if (overrideAccess) return
  const actor = await getActiveAccount(req)
  if (!actor) throw new APIError('An active staff account is required', 403)
  if (operation === 'delete') {
    const id = 'id' in args ? args.id : undefined
    if (!id) throw new APIError('Delete one draft at a time', 403)
    const transactionID = await req.transactionID
    const transaction = transactionID && req.payload.db.sessions?.[transactionID]?.db
    if (
      !transaction ||
      typeof transaction !== 'object' ||
      !('execute' in transaction) ||
      typeof transaction.execute !== 'function'
    )
      throw new APIError('Draft deletion requires a database transaction', 500)
    const table = req.payload.db.tables[args.collection.config.slug]
    // Recheck the status under a row lock, after any concurrent publication commits.
    await transaction.execute(sql`select id from ${table} where id = ${id} for update`)
  }
  if (hasRole(actor.role, 'publisher')) return

  const data = 'data' in args ? args.data : undefined
  if (
    (operation !== 'create' && operation !== 'update') ||
    !('draft' in args) ||
    args.draft !== true ||
    (data && '_status' in data && data._status === 'published') ||
    ('publishAllLocales' in args && args.publishAllLocales) ||
    ('unpublishAllLocales' in args && args.unpublishAllLocales) ||
    (operation === 'update' && (!('id' in args) || !args.id))
  ) {
    throw new APIError('Editors may only save individual drafts', 403)
  }
}
