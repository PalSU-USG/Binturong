import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  commitTransaction,
  createLocalReq,
  getPayload,
  handleEndpoints,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'
import { GRAPHQL_POST } from '@payloadcms/next/routes'
import { authorizeScheduling } from '@/jobs/authorizeScheduling'

import config from '@/payload.config'
import type { Post } from '@/payload-types'
import { userRoles, type UserRole } from '@/access/roles'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const content: Post['content'] = {
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            text: 'Synthetic publication fixture.',
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
}
const context = { disableRevalidate: true }

describe('editorial authority', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const records: { collection: 'pages' | 'posts'; id: number }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    const jobs = await payload.find({ collection: 'payload-jobs', limit: 1000, pagination: false })
    for (const job of jobs.docs) {
      if (job.taskSlug !== 'schedulePublish') continue
      const input = job.input
      const doc = input && typeof input === 'object' && !Array.isArray(input) ? input.doc : null
      if (
        !doc ||
        typeof doc !== 'object' ||
        Array.isArray(doc) ||
        !('value' in doc) ||
        !('relationTo' in doc)
      )
        continue
      if (
        records.some(
          (record) =>
            String(record.id) === String(doc.value) && record.collection === doc.relationTo,
        )
      ) {
        await payload.delete({ collection: 'payload-jobs', id: job.id })
      }
    }
    for (const record of records) {
      if (await payload.findByID({ ...record, disableErrors: true }))
        await payload.delete({ ...record, context })
    }
    await removeTestAccounts(
      payload,
      Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    )
  })

  function actor(role: UserRole) {
    return { ...fixtures.users[role], collection: 'users' as const }
  }
  async function schedulingArgs(role: UserRole) {
    const req = await createLocalReq({ user: actor(role) }, payload)
    return { req, importMap: {}, permissions: {}, cookies: new Map<string, string>() }
  }
  async function createRecord(
    collection: 'pages' | 'posts',
    role: UserRole = 'publisher',
    published = true,
  ) {
    const common = {
      title: `Synthetic ${collection} ${randomUUID()}`,
      slug: `synthetic-${randomUUID()}`,
      _status: published ? ('published' as const) : ('draft' as const),
    }
    const options = { user: actor(role), overrideAccess: false, draft: !published, context }
    const doc =
      collection === 'pages'
        ? await payload.create({
            collection,
            data: {
              ...common,
              hero: { type: 'none' },
              layout: [{ blockType: 'content', columns: [{ size: 'full', richText: content }] }],
            },
            ...options,
          })
        : await payload.create({
            collection,
            data: { ...common, content, authors: [fixtures.users.editor.id] },
            ...options,
          })
    records.push({ collection, id: doc.id })
    return doc
  }

  for (const collection of ['pages', 'posts'] as const) {
    it(`${collection}_allows_staff_drafts_and_publishers_to_restore_or_delete_a_draft`, async () => {
      for (const role of userRoles) {
        const doc = await createRecord(collection, role, false)
        expect(
          (
            await payload.findByID({
              collection,
              id: doc.id,
              draft: true,
              user: actor(role),
              overrideAccess: false,
            })
          ).title,
        ).toBe(doc.title)
        await expect(
          payload.findByID({ collection, id: doc.id, overrideAccess: false }),
        ).rejects.toMatchObject({ status: 404 })
      }
      const doc = await createRecord(collection, 'publisher', false)
      const versions = await payload.findVersions({
        collection,
        where: { parent: { equals: doc.id } },
        limit: 1,
        user: actor('publisher'),
        overrideAccess: false,
      })
      await expect(
        payload.findVersions({ collection, overrideAccess: false }),
      ).rejects.toMatchObject({ status: 403 })
      await payload.restoreVersion({
        collection,
        id: String(versions.docs[0].id),
        user: actor('publisher'),
        overrideAccess: false,
        context,
      })
      await payload.delete({
        collection,
        id: doc.id,
        user: actor('publisher'),
        overrideAccess: false,
        context,
      })
      expect(await payload.findByID({ collection, id: doc.id, disableErrors: true })).toBeNull()
    })

    it(`${collection}_keeps_editor_revisions_out_of_the_published_record`, async () => {
      const original = await createRecord(collection)
      const draft = await payload.update({
        collection,
        id: original.id,
        data: { title: 'Synthetic private revision' },
        draft: true,
        user: actor('editor'),
        overrideAccess: false,
        context,
      })
      expect(draft.title).toBe('Synthetic private revision')
      const published = await payload.findByID({
        collection,
        id: original.id,
        overrideAccess: false,
        draft: false,
      })
      expect(published.title).toBe(original.title)
      for (const options of [
        { data: { title: 'Synthetic direct overwrite' } },
        { data: { _status: 'published' as const }, draft: true },
        { data: { _status: 'draft' as const }, draft: false },
        {
          data: { title: 'Synthetic locale publish bypass' },
          draft: true,
          publishAllLocales: true,
        },
        {
          data: { title: 'Synthetic locale withdrawal bypass' },
          draft: true,
          unpublishAllLocales: true,
        },
      ]) {
        await expect(
          payload.update({
            collection,
            id: original.id,
            ...options,
            user: actor('editor'),
            overrideAccess: false,
            context,
          }),
        ).rejects.toMatchObject({ status: 403 })
      }
      await expect(
        payload.update({
          collection,
          where: { id: { equals: original.id } },
          data: { title: 'Synthetic bulk overwrite' },
          draft: true,
          user: actor('editor'),
          overrideAccess: false,
          context,
        }),
      ).rejects.toMatchObject({ status: 403 })
      expect(
        (
          await payload.findByID({
            collection,
            id: original.id,
            overrideAccess: false,
            draft: false,
          })
        ).title,
      ).toBe(original.title)
    })

    it(`${collection}_requires_publishing_authority_for_restore_and_deletion`, async () => {
      const doc = await createRecord(collection)
      const versions = await payload.findVersions({
        collection,
        where: { parent: { equals: doc.id } },
        limit: 1,
      })
      const version = versions.docs[0]
      await expect(
        payload.restoreVersion({
          collection,
          id: String(version.id),
          user: actor('editor'),
          overrideAccess: false,
          context,
        }),
      ).rejects.toMatchObject({ status: 403 })
      for (const role of userRoles) {
        await expect(
          payload.delete({
            collection,
            id: doc.id,
            user: actor(role),
            overrideAccess: false,
            context,
          }),
        ).rejects.toMatchObject({ status: 403 })
      }
    })

    it(`${collection}_cannot_delete_a_draft_that_is_concurrently_being_published`, async () => {
      const doc = await createRecord(collection, 'publisher', false)
      const req = await createLocalReq({ user: actor('publisher'), context }, payload)
      await initTransaction(req)
      let deletion: Promise<unknown> | undefined
      try {
        await payload.update({
          collection,
          id: doc.id,
          data: { ...doc, _status: 'published' },
          req,
          overrideAccess: false,
        })
        deletion = payload
          .delete({
            collection,
            id: doc.id,
            user: actor('publisher'),
            overrideAccess: false,
            context,
          })
          .then(
            () => null,
            (error: unknown) => error,
          )
        await vi.waitFor(
          async () => {
            const { rows } = await payload.db.pool.query(
              "select pid from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like $1",
              [`%${collection}%`],
            )
            expect(rows.length).toBeGreaterThan(0)
          },
          { timeout: 5000, interval: 10 },
        )
        await commitTransaction(req)
      } finally {
        await killTransaction(req)
      }
      expect(await deletion).toMatchObject({ status: 403 })
      expect(
        (await payload.findByID({ collection, id: doc.id, overrideAccess: false }))._status,
      ).toBe('published')
    })

    it(`${collection}_allows_publishers_and_higher_roles_to_publish_and_withdraw`, async () => {
      for (const role of ['publisher', 'admin', 'super_admin'] as const) {
        const doc = await createRecord(collection, role, false)
        await payload.update({
          collection,
          id: doc.id,
          data: { ...doc, _status: 'published' },
          user: actor(role),
          overrideAccess: false,
          context,
        })
        expect(
          (await payload.findByID({ collection, id: doc.id, overrideAccess: false, draft: false }))
            ._status,
        ).toBe('published')
        await payload.update({
          collection,
          id: doc.id,
          data: { _status: 'draft' },
          user: actor(role),
          overrideAccess: false,
          context,
        })
        await expect(
          payload.findByID({ collection, id: doc.id, overrideAccess: false, draft: false }),
        ).rejects.toMatchObject({ status: 404 })
      }
    })
  }

  it('denies_editor_writes_to_live_configuration_and_accepts_publishers', async () => {
    for (const slug of ['header', 'footer'] as const) {
      await expect(
        payload.updateGlobal({
          slug,
          data: { navItems: [] },
          user: actor('editor'),
          overrideAccess: false,
          context,
        }),
      ).rejects.toMatchObject({ status: 403 })
      await payload.updateGlobal({
        slug,
        data: { navItems: [] },
        user: actor('publisher'),
        overrideAccess: false,
        context,
      })
    }
    for (const collection of ['categories', 'redirects', 'forms'] as const) {
      const response = await handleEndpoints({
        config,
        request: new Request(`http://127.0.0.1:3003/api/${collection}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `JWT ${fixtures.tokens.editor}`,
          },
          body: JSON.stringify({ title: `Synthetic forbidden ${collection}` }),
        }),
      })
      expect(response.status).toBe(403)
    }
  })

  it('enforces_editor_permissions_through_rest_and_graphql', async () => {
    const post = await createRecord('posts')
    const request = new Request(`http://127.0.0.1:3003/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `JWT ${fixtures.tokens.editor}`,
      },
      body: JSON.stringify({ title: 'Synthetic REST overwrite' }),
    })
    expect((await handleEndpoints({ config, request })).status).toBe(403)
    const draftResponse = await handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api/posts/${post.id}?draft=true`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.editor}`,
        },
        body: JSON.stringify({ title: 'Synthetic REST draft' }),
      }),
    })
    expect(draftResponse.status).toBe(200)
    const response = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.editor}`,
        },
        body: JSON.stringify({
          query: `mutation { updatePost(id: ${post.id}, data: { _status: published }) { id } }`,
        }),
      }),
    )
    expect((await response.json()).errors?.[0]?.extensions.statusCode).toBe(403)
    expect(
      (await payload.findByID({ collection: 'posts', id: post.id, overrideAccess: false })).title,
    ).toBe(post.title)
  })

  it('keeps_public_media_readable_and_requires_active_staff_for_writes', async () => {
    const data = Buffer.from('Synthetic public media fixture.')
    const media = await payload.create({
      collection: 'media',
      file: {
        data,
        name: `synthetic-${randomUUID()}.txt`,
        mimetype: 'text/plain',
        size: data.length,
      },
      data: { alt: 'Synthetic public media fixture' },
      user: actor('editor'),
      overrideAccess: false,
    })
    try {
      expect(
        (await payload.findByID({ collection: 'media', id: media.id, overrideAccess: false })).alt,
      ).toBe('Synthetic public media fixture')
      await payload.update({
        collection: 'media',
        id: media.id,
        data: { alt: 'Synthetic corrected description' },
        user: actor('editor'),
        overrideAccess: false,
      })
      await expect(
        payload.update({
          collection: 'media',
          id: media.id,
          data: { alt: 'Synthetic anonymous change' },
          overrideAccess: false,
        }),
      ).rejects.toMatchObject({ status: 403 })
    } finally {
      await payload.delete({
        collection: 'media',
        id: media.id,
        user: actor('editor'),
        overrideAccess: false,
      })
    }
  })

  it('denies_editor_scheduling_through_the_native_server_function', async () => {
    const doc = await createRecord('posts')
    await expect(
      authorizeScheduling({
        ...(await schedulingArgs('editor')),
        doc: { relationTo: 'posts', value: String(doc.id) },
        type: 'publish',
        date: new Date('2099-01-01'),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('lets_publishers_schedule_and_cancel_without_queuing_an_empty_job', async () => {
    const doc = await createRecord('posts', 'publisher', false)
    const args = await schedulingArgs('publisher')
    await expect(
      authorizeScheduling({
        ...args,
        doc: { relationTo: 'posts', value: String(doc.id) },
        type: 'publish',
        date: new Date('2099-01-01'),
      }),
    ).resolves.toHaveProperty('message')
    const jobs = await payload.find({
      collection: 'payload-jobs',
      where: { 'input.doc.value': { equals: String(doc.id) } },
    })
    expect(jobs.docs).toHaveLength(1)
    const count = (await payload.count({ collection: 'payload-jobs' })).totalDocs
    await expect(
      authorizeScheduling({ ...args, deleteID: jobs.docs[0].id }),
    ).resolves.toHaveProperty('message')
    expect((await payload.count({ collection: 'payload-jobs' })).totalDocs).toBe(count - 1)
  })

  it('rejects_stale_publishing_authority_after_demotion', async () => {
    const doc = await createRecord('posts')
    const stale = actor('publisher')
    await payload.update({
      collection: 'users',
      id: stale.id,
      data: { role: 'editor' },
      user: actor('super_admin'),
      overrideAccess: false,
    })
    try {
      await expect(
        payload.update({
          collection: 'posts',
          id: doc.id,
          data: { _status: 'draft' },
          user: stale,
          overrideAccess: false,
          context,
        }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        authorizeScheduling({
          ...(await schedulingArgs('publisher')),
          doc: { relationTo: 'posts', value: String(doc.id) },
          type: 'publish',
          date: new Date('2099-01-01'),
        }),
      ).rejects.toMatchObject({ status: 403 })
      expect(
        (await payload.findByID({ collection: 'posts', id: doc.id, overrideAccess: false })).title,
      ).toBe(doc.title)
    } finally {
      await payload.update({
        collection: 'users',
        id: stale.id,
        data: { role: 'publisher' },
        user: actor('super_admin'),
        overrideAccess: false,
      })
    }
  })

  it('keeps_author_projection_private_and_revoked_accounts_out_of_drafts', async () => {
    const post = await createRecord('posts', 'publisher', false)
    const stale = actor('editor')
    await payload.update({
      collection: 'users',
      id: stale.id,
      data: { disabled: true },
      user: actor('super_admin'),
      overrideAccess: false,
    })
    await expect(
      payload.findByID({
        collection: 'posts',
        id: post.id,
        user: stale,
        overrideAccess: false,
        draft: true,
      }),
    ).rejects.toMatchObject({ status: 403 })
    const projection = await payload.findByID({
      collection: 'posts',
      id: post.id,
      user: actor('publisher'),
      overrideAccess: false,
      depth: 2,
    })
    expect(projection.populatedAuthors?.[0]?.name).toBeDefined()
    for (const author of projection.populatedAuthors ?? [])
      expect(Object.keys(author).every((key) => ['id', 'name'].includes(key))).toBe(true)
  })
})
