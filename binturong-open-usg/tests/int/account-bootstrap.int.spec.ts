import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, initTransaction, killTransaction, type Payload } from 'payload'
import { spawn } from 'node:child_process'

import config from '@/payload.config'
import { bootstrapSuperAdmin } from '@/collections/Users/bootstrap'
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

  async function runCLI(args: string[]) {
    return new Promise<{ status: number | null; output: string }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--import=tsx', 'scripts/bootstrap-super-admin.ts', ...args],
        {
          cwd: process.cwd(),
          env: { ...process.env, DOTENV_CONFIG_PATH: '.env.test' },
          windowsHide: true,
          timeout: 60000,
        },
      )
      let output = ''
      child.stdout.on('data', (data) => {
        output += data.toString()
      })
      child.stderr.on('data', (data) => {
        output += data.toString()
      })
      child.on('error', reject)
      child.on('close', (status) => resolve({ status, output }))
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
