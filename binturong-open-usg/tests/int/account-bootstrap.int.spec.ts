import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, initTransaction, killTransaction, type Payload } from 'payload'
import { spawn } from 'node:child_process'

import config from '@/payload.config'
import { bootstrapSuperAdmin, createFirstSuperAdmin } from '@/collections/Users/bootstrap'
import {
  assertLocalAccountDatabase,
  withAccountProvisioning,
} from '@/collections/Users/accountProvisioning'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'

describe('explicit local super-admin bootstrap', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    await removeTestAccounts(
      payload,
      Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    )
  })

  async function runCLI(args: string[], script = 'scripts/bootstrap-super-admin.ts', input = '') {
    return new Promise<{ status: number | null; output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import=tsx', script, ...args], {
        cwd: process.cwd(),
        env: { ...process.env, DOTENV_CONFIG_PATH: '.env.test' },
        windowsHide: true,
        timeout: 60000,
      })
      let output = ''
      child.stdout.on('data', (data) => {
        output += data.toString()
      })
      child.stderr.on('data', (data) => {
        output += data.toString()
      })
      child.on('error', reject)
      child.on('close', (status) => resolve({ status, output }))
      child.stdin.end(input)
    })
  }

  it('rejects_unknown_disabled_and_secondary_bootstrap_targets', async () => {
    const req = await createLocalReq({}, payload)
    for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER, fixtures.users.editor.id]) {
      await initTransaction(req)
      try {
        await expect(bootstrapSuperAdmin(req, id)).rejects.toBeDefined()
      } finally {
        await killTransaction(req)
      }
    }
    await initTransaction(req)
    try {
      await withAccountProvisioning(req, () =>
        payload.update({
          collection: 'users',
          id: fixtures.users.editor.id,
          data: { disabled: true },
          req,
        }),
      )
      await expect(bootstrapSuperAdmin(req, fixtures.users.editor.id)).rejects.toMatchObject({
        status: 400,
      })
    } finally {
      await killTransaction(req)
    }
  })

  it('rejects_remote_and_main_database_provisioning_before_writing', () => {
    const original = process.env.DATABASE_URL
    try {
      for (const url of [
        'postgresql://localhost:55322/postgres',
        'postgresql://example.invalid:55322/binturong_test',
        'postgresql://127.0.0.1:54322/binturong_test',
        'postgresql://localhost:45322/postgres',
        'postgresql://example.invalid:45322/binturong_test',
        'postgresql://127.0.0.1:45324/binturong_test',
        'postgresql://127.0.0.1:56322/binturong_test',
        'postgresql://127.0.0.1:56323/binturong_domain',
        'postgresql://example.invalid:45323/binturong_test',
        'postgresql://localhost:45323/postgres',
        'postgresql://localhost:45322/binturong_test?host=example.invalid',
        'postgresql://localhost:45322/binturong_test#override',
      ]) {
        process.env.DATABASE_URL = url
        expect(() => assertLocalAccountDatabase()).toThrow()
      }
    } finally {
      process.env.DATABASE_URL = original
    }
  })

  it('requires_an_explicit_id_and_keeps_dry_run_separate_from_apply', async () => {
    const req = await createLocalReq({}, payload)
    await withAccountProvisioning(req, () =>
      payload.update({
        collection: 'users',
        id: fixtures.users.super_admin.id,
        data: { role: 'editor' },
        req,
      }),
    )
    try {
      for (const args of [
        [],
        ['--user-id', '1.5'],
        ['--user-id', 'true'],
        ['--user-id', '1', '--force'],
      ]) {
        expect((await runCLI(args)).status).toBe(1)
      }
      const args = ['--user-id', String(fixtures.users.editor.id)]
      const dryRun = await runCLI(args)
      expect(dryRun).toMatchObject({ status: 0 })
      expect(dryRun.output).toContain('Dry run')
      expect(
        (await payload.findByID({ collection: 'users', id: fixtures.users.editor.id })).role,
      ).toBe('editor')
      expect((await runCLI([...args, '--apply'])).status).toBe(0)
      const promoted = await payload.findByID({ collection: 'users', id: fixtures.users.editor.id })
      expect(promoted.role).toBe('super_admin')
      expect((await runCLI([...args, '--apply'])).status).toBe(0)
      expect((await payload.findByID({ collection: 'users', id: promoted.id })).updatedAt).toBe(
        promoted.updatedAt,
      )
    } finally {
      await withAccountProvisioning(req, () =>
        payload.update({
          collection: 'users',
          id: fixtures.users.super_admin.id,
          data: { role: 'super_admin' },
          req,
        }),
      )
    }
  }, 180000)

  const firstAccount = {
    email: 'first-admin@example.invalid',
    name: 'Synthetic first admin',
    password: 'synthetic-first-admin-pass',
  }

  it('refuses_a_first_account_once_any_account_exists', async () => {
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    try {
      await expect(createFirstSuperAdmin(req, firstAccount)).rejects.toMatchObject({
        status: 409,
      })
    } finally {
      await killTransaction(req)
    }
    const { totalDocs } = await payload.count({
      collection: 'users',
      where: { email: { equals: firstAccount.email } },
    })
    expect(totalDocs).toBe(0)
  })

  it('creates_one_active_super_admin_only_in_an_empty_account_table', async () => {
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    try {
      // Empty the table inside this transaction only; the rollback restores every account.
      await payload.db.deleteMany({ collection: 'users', where: {}, req })
      for (const bad of [
        { ...firstAccount, email: 'not-an-email' },
        { ...firstAccount, password: 'short' },
      ]) {
        await expect(createFirstSuperAdmin(req, bad)).rejects.toMatchObject({ status: 400 })
      }
      const created = await createFirstSuperAdmin(req, firstAccount)
      expect(created).toMatchObject({ role: 'super_admin', disabled: false })
      await expect(
        createFirstSuperAdmin(req, { ...firstAccount, email: 'second@example.invalid' }),
      ).rejects.toMatchObject({ status: 409 })
    } finally {
      await killTransaction(req)
    }
    expect((await payload.findByID({ collection: 'users', id: fixtures.users.editor.id })).id).toBe(
      fixtures.users.editor.id,
    )
  })

  it('first_account_cli_needs_the_typed_host_and_stops_when_accounts_exist', async () => {
    const script = 'scripts/create-first-account.ts'
    const args = ['--email', firstAccount.email]
    const host = new URL(process.env.DATABASE_URL || '').hostname
    const pass = `${firstAccount.password}\n${firstAccount.password}\n`
    expect((await runCLI([], script)).status).toBe(1)
    const wrongHost = await runCLI(args, script, `wrong.example.invalid\n${pass}`)
    expect(wrongHost.status).toBe(1)
    expect(wrongHost.output).toContain('did not match')
    const existing = await runCLI([...args, '--apply'], script, `${host}\n${pass}`)
    expect(existing.status).toBe(1)
    expect(existing.output).toContain('already exist')
    const { totalDocs } = await payload.count({
      collection: 'users',
      where: { email: { equals: firstAccount.email } },
    })
    expect(totalDocs).toBe(0)
  }, 120000)

  it('joins_the_callers_transaction_and_rolls_back_promotion', async () => {
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    try {
      await withAccountProvisioning(req, async () => {
        await payload.update({
          collection: 'users',
          id: fixtures.users.super_admin.id,
          data: { role: 'editor' },
          req,
        })
        await payload.update({
          collection: 'users',
          id: fixtures.users.editor.id,
          data: { role: 'editor' },
          req,
        })
      })
      await bootstrapSuperAdmin(req, fixtures.users.publisher.id)
      expect(
        (await payload.findByID({ collection: 'users', id: fixtures.users.publisher.id, req }))
          .role,
      ).toBe('super_admin')
    } finally {
      await killTransaction(req)
    }
    expect(
      (await payload.findByID({ collection: 'users', id: fixtures.users.super_admin.id })).role,
    ).toBe('super_admin')
    expect(
      (await payload.findByID({ collection: 'users', id: fixtures.users.publisher.id })).role,
    ).toBe('publisher')
  })
})
