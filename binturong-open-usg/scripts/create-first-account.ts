import 'dotenv/config'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
  })
  if (!values.email) {
    throw new Error(
      'Usage: npm run create:first-account -- --email <address> [--name <name>] [--apply]',
    )
  }
  const target = new URL(process.env.DATABASE_URL || '')
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string')
  }

  // Prompts read from the terminal so the host check and password stay out of shell history.
  const terminal = Boolean(process.stdin.isTTY)
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal })
  let muted = false
  const output = rl as unknown as { _writeToOutput: (text: string) => void }
  const write = output._writeToOutput.bind(rl)
  output._writeToOutput = (text) => {
    if (!muted) write(text)
  }
  const lines = rl[Symbol.asyncIterator]()
  const ask = async (prompt: string, hidden = false) => {
    process.stdout.write(prompt)
    muted = hidden
    const { value } = await lines.next()
    muted = false
    if (hidden) process.stdout.write('\n')
    return typeof value === 'string' ? value : ''
  }

  let password: string
  try {
    console.log(`Target database: ${target.hostname}:${target.port || 5432}${target.pathname}`)
    if ((await ask('Type the host name above to confirm: ')).trim() !== target.hostname) {
      throw new Error('The host name did not match; nothing was changed')
    }
    password = await ask('Password for the first account: ', terminal)
    if ((await ask('Type the password again: ', terminal)) !== password) {
      throw new Error('The passwords did not match; nothing was changed')
    }
  } finally {
    rl.close()
  }

  const { commitTransaction, createLocalReq, getPayload, initTransaction, killTransaction } =
    await import('payload')
  const { createFirstSuperAdmin } = await import('../src/collections/Users/bootstrap')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)
  try {
    await initTransaction(req)
    const account = await createFirstSuperAdmin(req, {
      email: values.email,
      name: values.name,
      password,
    })
    if (values.apply) {
      await commitTransaction(req)
      console.log(`Created super-admin ${account.email} (account ${account.id}); sign in at /admin`)
    } else {
      await killTransaction(req)
      console.log(`Dry run: ${account.email} can be created; no changes saved. Add --apply.`)
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
    console.error(error instanceof Error ? error.message : 'Creating the first account failed')
    process.exit(1)
  },
)
