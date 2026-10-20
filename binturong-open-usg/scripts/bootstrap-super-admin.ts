import 'dotenv/config'
import { parseArgs } from 'node:util'

async function main() {
  const { values } = parseArgs({
    options: { 'user-id': { type: 'string' }, apply: { type: 'boolean', default: false } },
  })
  const suppliedID = values['user-id']
  if (!suppliedID || !/^[1-9]\d*$/.test(suppliedID) || !Number.isSafeInteger(Number(suppliedID))) {
    throw new Error('Usage: npm run bootstrap:super-admin -- --user-id <existing-id> [--apply]')
  }
  const { assertLocalAccountDatabase } =
    await import('../src/collections/Users/accountProvisioning')
  assertLocalAccountDatabase()
  const { commitTransaction, createLocalReq, getPayload, initTransaction, killTransaction } =
    await import('payload')
  const { bootstrapSuperAdmin } = await import('../src/collections/Users/bootstrap')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)
  try {
    await initTransaction(req)
    await bootstrapSuperAdmin(req, Number(suppliedID))
    if (values.apply) {
      await commitTransaction(req)
      console.log(`Super-admin bootstrap applied for account ${suppliedID}`)
    } else {
      await killTransaction(req)
      console.log(`Dry run: account ${suppliedID} is eligible; no changes saved`)
    }
  } finally {
    await killTransaction(req)
    await payload.destroy()
  }
}

// The installed adapter retains a pool client; match Payload's CLI exit after cleanup.
main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Super-admin bootstrap failed')
    process.exit(1)
  },
)
