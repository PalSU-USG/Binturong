import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  commitTransaction,
  createLocalReq,
  getPayload,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'
import { NextRequest } from 'next/server'

import config from '@/payload.config'
import { userRoles, type UserRole } from '@/access/roles'
import { POST as seedRoute } from '@/app/(frontend)/next/seed/route'
import { GET as previewRoute } from '@/app/(frontend)/next/preview/route'
import { generateMetadata as pageMetadata } from '@/app/(frontend)/[slug]/page'
import { generateMetadata as postMetadata } from '@/app/(frontend)/posts/[slug]/page'
import { authorizeScheduling } from '@/jobs/authorizeScheduling'
import { lockAccounts } from '@/collections/Users/accountProvisioning'
import { getUpcomingScheduledPublishHandler } from '@payloadcms/ui/utilities/schedulePublishHandler'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import { syntheticContent } from '../helpers/contentFixtures'

const framework = vi.hoisted(() => ({
  headers: new Headers(),
  draft: { isEnabled: true, enable: vi.fn(), disable: vi.fn() },
  seed: vi.fn(),
}))
vi.mock('next/headers', () => ({
  headers: async () => framework.headers,
  draftMode: async () => framework.draft,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`Synthetic redirect: ${path}`)
  },
}))
// The template endpoint clears data; exercise its authorization without running it.
vi.mock('@/endpoints/seed', () => ({ seed: framework.seed }))
vi.mock('@/blocks/RenderBlocks', () => ({ RenderBlocks: () => null }))
vi.mock('@/heros/RenderHero', () => ({ RenderHero: () => null }))
vi.mock('@/heros/PostHero', () => ({ PostHero: () => null }))
vi.mock('@/components/RichText', () => ({ default: () => null }))
vi.mock('@/components/LivePreviewListener', () => ({ LivePreviewListener: () => null }))
vi.mock('@/app/(frontend)/[slug]/page.client', () => ({ default: () => null }))
vi.mock('@/app/(frontend)/posts/[slug]/page.client', () => ({ default: () => null }))

const context = { disableRevalidate: true }

describe('operational authority', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const records: { collection: 'pages' | 'posts'; id: number }[] = []
  const jobs: number[] = []
  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    for (const id of jobs) {
      if (await payload.findByID({ collection: 'payload-jobs', id, disableErrors: true }))
        await payload.delete({ collection: 'payload-jobs', id })
    }
    for (const record of records) await payload.delete({ ...record, context })
    await removeTestAccounts(
      payload,
      Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    )
  })
  const actor = (role: UserRole) => ({ ...fixtures.users[role], collection: 'users' as const })
  const headersFor = (role?: UserRole) =>
    new Headers(
      role
        ? {
            Authorization: `JWT ${fixtures.tokens[role]}`,
          }
        : {},
    )
  async function record(collection: 'pages' | 'posts', published = false) {
    const common = {
      title: `Synthetic operation ${randomUUID()}`,
      slug: `synthetic-${randomUUID()}`,
      meta: { title: `Synthetic private metadata ${randomUUID()}` },
      _status: published ? ('published' as const) : ('draft' as const),
    }
    const options = { user: actor('publisher'), overrideAccess: false, draft: !published, context }
    const doc =
      collection === 'pages'
        ? await payload.create({
            collection,
            data: {
              ...common,
              hero: { type: 'none' },
              layout: [
                { blockType: 'content', columns: [{ size: 'full', richText: syntheticContent }] },
              ],
            },
            ...options,
          })
        : await payload.create({
            collection,
            data: { ...common, content: syntheticContent },
            ...options,
          })
    records.push({ collection, id: doc.id })
    return doc
  }
  async function schedule(
    id: number,
    type: 'publish' | 'unpublish' = 'publish',
    collection: 'pages' | 'posts' = 'posts',
  ) {
    const req = await createLocalReq({ user: actor('publisher'), context }, payload)
    await authorizeScheduling({
      req,
      importMap: {},
      permissions: {},
      cookies: new Map(),
      doc: { relationTo: collection, value: String(id) },
      type,
      date: new Date(Date.now() - 1000),
    })
    const result = await payload.find({
      collection: 'payload-jobs',
      depth: 0,
      sort: '-id',
      limit: 1,
      where: { 'input.doc.value': { equals: String(id) } },
    })
    const job = result.docs[0]
    expect(job).toBeDefined()
    jobs.push(job.id)
    return job
  }
  async function run(id: number) {
    vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret')
    const req = await createLocalReq({ context }, payload)
    req.headers = new Headers({ Authorization: 'Bearer synthetic-cron-secret' })
    await payload.jobs.runByID({ id, req, overrideAccess: false, silent: true })
    return payload.findByID({ collection: 'payload-jobs', id, disableErrors: true })
  }

  it('denies_template_seed_for_every_role_before_any_destructive_work', async () => {
    for (const role of [undefined, ...userRoles]) {
      framework.headers = headersFor(role)
      expect((await seedRoute()).status).toBe(403)
    }
    expect(framework.seed).not.toHaveBeenCalled()
  })

  it('requires_a_secret_and_active_staff_for_relative_preview', async () => {
    vi.stubEnv('PREVIEW_SECRET', 'synthetic-preview-secret')
    const preview = (path: string, role?: UserRole, secret = 'synthetic-preview-secret') =>
      previewRoute(
        new NextRequest(
          `http://127.0.0.1:3003/next/preview?${new URLSearchParams({
            path,
            previewSecret: secret,
          })}`,
          { headers: headersFor(role) },
        ),
      )
    expect((await preview('/posts/test')).status).toBe(403)
    expect((await preview('/posts/test', 'publisher', 'wrong')).status).toBe(403)
    for (const role of userRoles)
      await expect(preview('/posts/test', role)).rejects.toThrow('Synthetic redirect: /posts/test')
    expect((await preview('https://example.invalid/', 'publisher')).status).toBeGreaterThanOrEqual(
      400,
    )
    vi.stubEnv('PREVIEW_SECRET', '')
    expect((await preview('/posts/test', 'publisher', '')).status).toBe(403)
  })

  for (const collection of ['pages', 'posts'] as const) {
    it(`${collection}_does_not_treat_the_preview_cookie_as_draft_permission`, async () => {
      const doc = await record(collection)
      framework.headers = headersFor()
      framework.draft.isEnabled = true
      const metadata = collection === 'pages' ? pageMetadata : postMetadata
      expect(
        JSON.stringify(await metadata({ params: Promise.resolve({ slug: doc.slug! }) })),
      ).not.toContain(doc.meta!.title)
      framework.headers = headersFor('editor')
      expect(
        JSON.stringify(await metadata({ params: Promise.resolve({ slug: doc.slug! }) })),
      ).toContain(doc.meta!.title)
    })
  }

  it('restricts_user_scoped_queue_and_runner_to_publishers', async () => {
    const doc = await record('posts', true)
    const job = await schedule(doc.id)
    const req = await createLocalReq({ user: actor('editor'), context }, payload)
    await expect(
      payload.jobs.runByID({ id: job.id, req, overrideAccess: false, silent: true }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.jobs.queue({
        task: 'schedulePublish',
        input: {},
        overrideAccess: false,
        req,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('rejects_legacy_jobs_even_when_the_runner_has_a_valid_cron_secret', async () => {
    const doc = await record('posts', true)
    await payload.update({ collection: 'posts', id: doc.id, data: { _status: 'draft' }, context })
    const job = await payload.jobs.queue({
      task: 'schedulePublish',
      input: {
        doc: { relationTo: 'posts', value: String(doc.id) },
        type: 'publish',
      },
    })
    jobs.push(job.id)
    await run(job.id)
    expect((await payload.findByID({ collection: 'posts', id: doc.id }))._status).toBe('draft')
    expect((await payload.findByID({ collection: 'payload-jobs', id: job.id })).hasError).toBe(true)
  })

  it('rejects_a_revoked_scheduling_actor_at_execution', async () => {
    const doc = await record('posts', true)
    await payload.update({ collection: 'posts', id: doc.id, data: { _status: 'draft' }, context })
    const job = await schedule(doc.id)
    await payload.update({
      collection: 'users',
      id: fixtures.users.publisher.id,
      data: { role: 'editor' },
      user: actor('admin'),
      overrideAccess: false,
    })
    try {
      await run(job.id)
      expect((await payload.findByID({ collection: 'posts', id: doc.id }))._status).toBe('draft')
      expect((await payload.findByID({ collection: 'payload-jobs', id: job.id })).hasError).toBe(
        true,
      )
    } finally {
      await payload.update({
        collection: 'users',
        id: fixtures.users.publisher.id,
        data: { role: 'publisher' },
        user: actor('admin'),
        overrideAccess: false,
      })
    }
  })

  it('records_server_chosen_revision_proof_and_publishes_a_complete_saved_draft', async () => {
    const doc = await record('posts')
    const job = await schedule(doc.id)
    expect(job.input).toMatchObject({
      accountID: fixtures.users.publisher.id,
      collection: 'posts',
      documentID: doc.id,
      versionID: expect.any(Number),
      versionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    await run(job.id)
    const published = await payload.findByID({
      collection: 'posts',
      id: doc.id,
      overrideAccess: false,
    })
    expect(published._status).toBe('published')
    expect(published.title).toBe(doc.title)
    expect(published.content).toEqual(syntheticContent)
  })

  it('rejects_newer_saved_or_autosaved_content_instead_of_publishing_it', async () => {
    for (const autosave of [false, true]) {
      const doc = await record('posts', true)
      await payload.update({
        collection: 'posts',
        id: doc.id,
        data: { title: 'Synthetic reviewed' },
        draft: true,
        autosave,
        user: actor('editor'),
        overrideAccess: false,
        context,
      })
      const job = await schedule(doc.id)
      await payload.update({
        collection: 'posts',
        id: doc.id,
        data: { title: 'Synthetic later edit' },
        draft: true,
        autosave,
        user: actor('editor'),
        overrideAccess: false,
        context,
      })
      expect((await run(job.id))?.hasError).toBe(true)
      expect(
        (
          await payload.findByID({
            collection: 'posts',
            id: doc.id,
            overrideAccess: false,
            draft: false,
          })
        ).title,
      ).toBe(doc.title)
    }
  })

  it('denies_missing_or_invalid_runner_credentials_and_disabled_staff', async () => {
    const doc = await record('posts')
    const job = await schedule(doc.id)
    vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret')
    for (const authorization of [undefined, 'Bearer wrong']) {
      const req = await createLocalReq({ context }, payload)
      req.headers = new Headers(authorization ? { authorization } : {})
      await expect(
        payload.jobs.runByID({ id: job.id, req, overrideAccess: false, silent: true }),
      ).rejects.toMatchObject({ status: 403 })
    }
    const stale = actor('publisher')
    await payload.update({
      collection: 'users',
      id: stale.id,
      data: { disabled: true },
      user: actor('admin'),
      overrideAccess: false,
    })
    try {
      const req = await createLocalReq({ user: stale, context }, payload)
      await expect(
        payload.jobs.runByID({ id: job.id, req, overrideAccess: false, silent: true }),
      ).rejects.toMatchObject({ status: 403 })
      framework.headers = headersFor('publisher')
      vi.stubEnv('PREVIEW_SECRET', 'synthetic-preview-secret')
      expect(
        (
          await previewRoute(
            new NextRequest(
              'http://127.0.0.1:3003/next/preview?path=/posts/test&previewSecret=synthetic-preview-secret',
              { headers: framework.headers },
            ),
          )
        ).status,
      ).toBe(403)
      const metadata = await postMetadata({ params: Promise.resolve({ slug: doc.slug! }) })
      expect(JSON.stringify(metadata)).not.toContain(doc.meta!.title)
      expect((await run(job.id))?.hasError).toBe(true)
    } finally {
      await payload.update({
        collection: 'users',
        id: stale.id,
        data: { disabled: false },
        user: actor('admin'),
        overrideAccess: false,
      })
      const login = await payload.login({
        collection: 'users',
        data: {
          email: stale.email,
          password: 'synthetic-access-password',
        },
      })
      fixtures.tokens.publisher = login.token!
    }
  })

  it('rejects_malformed_proof_without_coercing_account_or_document_ids', async () => {
    const doc = await record('posts')
    const original = await schedule(doc.id)
    for (const patch of [
      { accountID: true },
      { accountID: String(fixtures.users.publisher.id) },
      { documentID: 0 },
      { versionID: false },
      { versionHash: '' },
      { collection: 'users' },
      { appliedVersionID: 1 },
      { appliedVersionHash: 'a'.repeat(64) },
      { appliedVersionID: 1, appliedVersionHash: null },
      { appliedVersionID: 0, appliedVersionHash: 'a'.repeat(64) },
      { appliedVersionID: '1', appliedVersionHash: 'a'.repeat(64) },
      { appliedVersionID: true, appliedVersionHash: 'a'.repeat(64) },
      { appliedVersionID: 1, appliedVersionHash: '' },
    ]) {
      const job = await payload.create({
        collection: 'payload-jobs',
        data: {
          taskSlug: 'schedulePublish',
          input: {
            ...(original.input as Record<string, unknown>),
            ...patch,
          },
        },
      })
      jobs.push(job.id)
      expect((await run(job.id))?.hasError).toBe(true)
      expect((await payload.findByID({ collection: 'posts', id: doc.id }))._status).toBe('draft')
    }
  })

  it('preserves_native_upcoming_schedules_and_withdraws_a_reviewed_page', async () => {
    const doc = await record('pages', true)
    const job = await schedule(doc.id, 'unpublish', 'pages')
    await payload.update({
      collection: 'payload-jobs',
      id: job.id,
      data: { waitUntil: new Date(Date.now() + 60000).toISOString() },
    })
    const req = await createLocalReq({ user: actor('publisher'), context }, payload)
    const upcoming = await getUpcomingScheduledPublishHandler({
      req,
      importMap: {},
      permissions: {},
      cookies: new Map(),
      id: doc.id,
      collectionSlug: 'pages',
    })
    expect(upcoming.some(({ id }) => id === job.id)).toBe(true)
    await payload.update({
      collection: 'payload-jobs',
      id: job.id,
      data: { waitUntil: new Date(Date.now() - 1000).toISOString() },
    })
    await run(job.id)
    await expect(
      payload.findByID({ collection: 'pages', id: doc.id, overrideAccess: false }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('allows_publishers_and_higher_roles_to_run_jobs_but_does_not_claim_started_jobs_were_cancelled', async () => {
    for (const role of ['publisher', 'admin', 'super_admin'] as const) {
      const doc = await record('posts')
      const job = await schedule(doc.id)
      const req = await createLocalReq({ user: actor(role), context }, payload)
      await payload.jobs.runByID({ id: job.id, req, overrideAccess: false, silent: true })
      expect(
        (await payload.findByID({ collection: 'posts', id: doc.id, overrideAccess: false })).title,
      ).toBe(doc.title)
    }
    const doc = await record('posts')
    const job = await schedule(doc.id)
    await payload.update({ collection: 'payload-jobs', id: job.id, data: { processing: true } })
    const req = await createLocalReq({ user: actor('publisher'), context }, payload)
    await expect(
      authorizeScheduling({
        req,
        importMap: {},
        permissions: {},
        cookies: new Map(),
        deleteID: job.id,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(await payload.findByID({ collection: 'payload-jobs', id: job.id })).toBeDefined()
  })

  it('rolls_back_content_and_receipt_on_real_native_failure_then_retries', async () => {
    const doc = await record('posts')
    const job = await schedule(doc.id)
    const hooks = payload.collections.posts.config.hooks.afterChange!
    const fail = () => {
      throw new Error('Synthetic failure after content write')
    }
    hooks.push(fail)
    try {
      expect((await run(job.id))?.hasError).toBe(true)
    } finally {
      hooks.splice(hooks.indexOf(fail), 1)
    }
    expect((await payload.findByID({ collection: 'posts', id: doc.id }))._status).toBe('draft')
    expect(
      (await payload.find({ collection: 'search', where: { 'doc.value': { equals: doc.id } } }))
        .docs,
    ).toHaveLength(0)
    const failed = await payload.findByID({ collection: 'payload-jobs', id: job.id })
    expect(failed.input).not.toHaveProperty('appliedVersionID')
    await payload.update({
      collection: 'payload-jobs',
      id: job.id,
      data: { hasError: false, processing: false },
    })
    await run(job.id)
    expect(
      (await payload.findByID({ collection: 'posts', id: doc.id, overrideAccess: false })).title,
    ).toBe(doc.title)
  })

  it('recognizes_a_committed_publication_when_native_completion_recording_fails', async () => {
    const doc = await record('posts')
    const job = await schedule(doc.id)
    const original = payload.db.updateJobs.bind(payload.db)
    let injected = false
    const failure = vi.spyOn(payload.db, 'updateJobs').mockImplementation(async (args) => {
      if (args.data.completedAt && !injected) {
        injected = true
        // Release the native bookkeeping transaction owned by this injected failure.
        await payload.db.rollbackTransaction(await args.req!.transactionID!)
        throw new Error('Synthetic lost job-completion write')
      }
      return original(args)
    })
    try {
      await expect(run(job.id)).rejects.toThrow('Synthetic lost job-completion write')
    } finally {
      failure.mockRestore()
    }
    expect(injected).toBe(true)
    const committed = await payload.findByID({ collection: 'payload-jobs', id: job.id })
    expect(committed.input).toHaveProperty('appliedVersionID')
    expect(
      (await payload.findByID({ collection: 'posts', id: doc.id, overrideAccess: false })).title,
    ).toBe(doc.title)
    const versions = await payload.findVersions({
      collection: 'posts',
      where: { parent: { equals: doc.id } },
    })
    await payload.update({
      collection: 'payload-jobs',
      id: job.id,
      data: { hasError: false, processing: false },
    })
    await run(job.id)
    expect(
      (await payload.findVersions({ collection: 'posts', where: { parent: { equals: doc.id } } }))
        .totalDocs,
    ).toBe(versions.totalDocs)
  })

  it('does_not_stamp_a_receipt_after_search_sync_aborts_the_native_content_transaction', async () => {
    const doc = await record('posts')
    const job = await schedule(doc.id)
    const hooks = payload.collections.search.config.hooks.beforeChange!
    const fail = () => {
      throw new Error('Synthetic search-sync write failure')
    }
    hooks.push(fail)
    try {
      expect((await run(job.id))?.hasError).toBe(true)
    } finally {
      hooks.splice(hooks.indexOf(fail), 1)
    }
    expect((await payload.findByID({ collection: 'posts', id: doc.id }))._status).toBe('draft')
    expect(
      (await payload.findByID({ collection: 'payload-jobs', id: job.id })).input,
    ).not.toHaveProperty('appliedVersionID')
    await payload.update({
      collection: 'payload-jobs',
      id: job.id,
      data: { hasError: false, processing: false },
    })
    await run(job.id)
    expect(
      (await payload.findByID({ collection: 'posts', id: doc.id, overrideAccess: false })).title,
    ).toBe(doc.title)
  })

  it('rechecks_the_scheduling_actor_after_an_observed_concurrent_role_change', async () => {
    const doc = await record('posts')
    const job = await schedule(doc.id)
    const req = await createLocalReq({ user: actor('admin'), context }, payload)
    await initTransaction(req)
    await lockAccounts(req)
    const pending = run(job.id)
    try {
      await vi.waitFor(
        async () => {
          const result = await payload.db.pool.query(
            "select pid from pg_locks where locktype='advisory' and classid=20261020 and objid=1 and not granted",
          )
          expect(result.rows.length).toBeGreaterThan(0)
        },
        { timeout: 5000, interval: 10 },
      )
      await payload.update({
        collection: 'users',
        id: fixtures.users.publisher.id,
        data: { role: 'editor' },
        req,
        overrideAccess: false,
      })
      await commitTransaction(req)
      expect((await pending)?.hasError).toBe(true)
      expect((await payload.findByID({ collection: 'posts', id: doc.id }))._status).toBe('draft')
    } finally {
      await killTransaction(req)
      await pending
      await payload.update({
        collection: 'users',
        id: fixtures.users.publisher.id,
        data: { role: 'publisher' },
        user: actor('admin'),
        overrideAccess: false,
      })
    }
  })
})
