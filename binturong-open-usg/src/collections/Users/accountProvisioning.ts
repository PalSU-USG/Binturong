import { sql } from '@payloadcms/db-postgres'
import { APIError, type PayloadRequest } from 'payload'

const provisioning = new WeakSet<PayloadRequest>()

export function isAccountProvisioning(req: PayloadRequest): boolean {
  return provisioning.has(req)
}

export function assertLocalAccountDatabase(): void {
  const target = new URL(process.env.DATABASE_URL || '')
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.port !== '55322' ||
    !['/binturong_domain', '/binturong_test'].includes(target.pathname) ||
    target.search ||
    target.hash
  ) {
    throw new Error('Account provisioning requires the isolated local branch or test database')
  }
}

export async function withAccountProvisioning<T>(
  req: PayloadRequest,
  action: () => Promise<T>,
): Promise<T> {
  assertLocalAccountDatabase()
  provisioning.add(req)
  try {
    return await action()
  } finally {
    provisioning.delete(req)
  }
}

export async function lockAccounts(req: PayloadRequest): Promise<void> {
  const transactionID = await req.transactionID
  const transaction = transactionID && req.payload.db.sessions?.[transactionID]?.db
  if (
    !transaction ||
    typeof transaction !== 'object' ||
    !('execute' in transaction) ||
    typeof transaction.execute !== 'function'
  ) {
    throw new APIError('Account changes require a database transaction', 500)
  }
  await transaction.execute(sql`select pg_advisory_xact_lock(20261020, 1)`)
}
