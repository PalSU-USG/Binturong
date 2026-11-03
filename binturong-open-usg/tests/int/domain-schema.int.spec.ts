import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, handleEndpoints, type Payload } from 'payload'
import { GRAPHQL_POST } from '@payloadcms/next/routes'

import config from '@/payload.config'
import { userRoles, type UserRole } from '@/access/roles'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'

describe('domain metadata drafts', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const documents: { collection: 'organizations' | 'academic-years'; id: number }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })

  afterAll(async () => {
    for (const { collection, id } of documents.reverse()) {
      if (await payload.findByID({ collection, id, disableErrors: true }))
        await payload.delete({ collection, id, user: actor('super_admin'), overrideAccess: false })
    }
    if (fixtures)
      await removeTestAccounts(
        payload,
        Object.values(fixtures.users).map(({ id }) => id),
      )
  })

  const actor = (role: UserRole) => ({ ...fixtures.users[role], collection: 'users' as const })

  function request(path: string, role?: UserRole, method = 'GET', data?: unknown) {
    return handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(role ? { Authorization: `JWT ${fixtures.tokens[role]}` } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      }),
    })
  }

  async function organization(data: Record<string, unknown> = {}, role: UserRole = 'editor') {
    const doc = await payload.create({
      collection: 'organizations',
      draft: true,
      overrideAccess: false,
      user: actor(role),
      data: { name: `Synthetic organization ${randomUUID()}`, kind: 'usg', ...data },
    })
    documents.push({ collection: 'organizations', id: doc.id })
    return doc
  }

  for (const role of userRoles) {
    it(`${role}_can_prepare_and_read_private_metadata`, async () => {
      const org = await organization({}, role)
      expect(org).toMatchObject({ kind: 'usg', participating: false, _status: 'draft' })
      expect(typeof org.id).toBe('number')
      expect(org.slug).toMatch(/^synthetic-organization-/)
      const year = await payload.create({
        collection: 'academic-years',
        draft: true,
        overrideAccess: false,
        user: actor(role),
        data: { label: `Synthetic year ${randomUUID()}` },
      })
      documents.push({ collection: 'academic-years', id: year.id })
      expect(year.slug).toMatch(/^synthetic-year-/)
      expect(year.startDate ?? null).toBeNull()
      expect(year.endDate ?? null).toBeNull()
      for (const [collection, id] of [
        ['organizations', org.id],
        ['academic-years', year.id],
      ] as const) {
        const response = await request(`/${collection}/${id}?draft=true`, role)
        expect(response.status).toBe(200)
        expect((await response.json()).id).toBe(id)
        expect((await request(`/${collection}/${id}`)).status).toBe(404)
        expect((await request(`/${collection}/${id}?draft=true`)).status).toBe(404)
        const versionPath = `/${collection}/versions?where[parent][equals]=${id}`
        const versions = await request(versionPath, role)
        expect(versions.status).toBe(200)
        const versionID = (await versions.json()).docs[0].id
        expect((await request(versionPath)).status).toBe(403)
        expect((await request(`/${collection}/versions/${versionID}`)).status).toBe(403)
      }
    })

    it(`${role}_cannot_publish_or_use_unreviewed_native_operations`, async () => {
      const org = await organization({}, role)
      for (const change of [
        { data: { _status: 'published' as const }, draft: true },
        { data: { name: 'Synthetic unreviewed overwrite' }, draft: false },
        { data: { _status: 'draft' as const }, draft: true, autosave: true },
        { data: { _status: 'draft' as const }, draft: true, publishAllLocales: true },
        { data: { _status: 'draft' as const }, draft: true, unpublishAllLocales: true },
      ])
        await expect(
          payload.update({
            collection: 'organizations',
            id: org.id,
            overrideAccess: false,
            user: actor(role),
            ...change,
          }),
        ).rejects.toMatchObject({ status: 403 })
      const versions = await payload.findVersions({
        collection: 'organizations',
        where: { parent: { equals: org.id } },
      })
      await expect(
        payload.restoreVersion({
          collection: 'organizations',
          id: versions.docs[0].id,
          user: actor(role),
          overrideAccess: false,
        }),
      ).rejects.toMatchObject({ status: 403 })
      expect(
        (
          await request(`/organizations/${org.id}`, role, 'PATCH', {
            _status: 'published',
            context: { domainTransition: true, privileged: true },
          })
        ).status,
      ).toBe(403)
      expect((await request(`/organizations/${org.id}`)).status).toBe(404)
    })
  }

  it('allows_incomplete_drafts_without_inventing_source_facts', async () => {
    const org = await organization({ name: null, kind: null })
    expect(org.name ?? null).toBeNull()
    expect(org.kind ?? null).toBeNull()
    expect(org.participating).toBe(false)
    const year = await payload.create({
      collection: 'academic-years',
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      data: {},
    })
    documents.push({ collection: 'academic-years', id: year.id })
    expect(year.label ?? null).toBeNull()
    expect(year.startDate ?? null).toBeNull()
  })

  it('keeps_initial_and_later_draft_slugs_unique', async () => {
    const slug = `synthetic-${randomUUID()}`
    await organization({ slug })
    await expect(organization({ slug })).rejects.toMatchObject({ status: 400 })
    const first = await organization()
    const second = await organization()
    const newSlug = `synthetic-draft-${randomUUID()}`
    await payload.update({
      collection: 'organizations',
      id: first.id,
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      data: { slug: newSlug },
    })
    await expect(
      payload.update({
        collection: 'organizations',
        id: second.id,
        draft: true,
        user: actor('editor'),
        overrideAccess: false,
        data: { slug: newSlug },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await payload.update({
      collection: 'organizations',
      id: first.id,
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      data: { name: 'Synthetic revised name' },
    })
    expect(
      (
        await payload.findByID({
          collection: 'organizations',
          id: first.id,
          draft: true,
          user: actor('editor'),
          overrideAccess: false,
        })
      ).slug,
    ).toBe(newSlug)
  })

  it('denies_forged_audit_bulk_writes_and_privileged_authority_bypass', async () => {
    const org = await organization()
    for (const data of [{ publishedAt: '2026-01-01' }, { lastTransition: { actorID: 1 } }])
      await expect(
        payload.update({
          collection: 'organizations',
          id: org.id,
          draft: true,
          user: actor('super_admin'),
          overrideAccess: true,
          data: { name: org.name, ...data },
        }),
      ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload
        .create({
          collection: 'organizations',
          draft: true,
          overrideAccess: true,
          data: { name: 'Synthetic anonymous privilege' },
        })
        .then((doc) => {
          documents.push({ collection: 'organizations', id: doc.id })
          return doc
        }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'organizations',
        draft: true,
        user: actor('super_admin'),
        overrideAccess: false,
        where: { id: { equals: org.id } },
        data: { name: 'Synthetic bulk' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.delete({
        collection: 'organizations',
        user: actor('super_admin'),
        overrideAccess: false,
        where: { id: { equals: org.id } },
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.delete({
        collection: 'organizations',
        id: org.id,
        user: actor('editor'),
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'organizations',
        id: org.id,
        draft: true,
        user: { ...actor('editor'), id: Number.MAX_SAFE_INTEGER },
        overrideAccess: true,
        data: { name: 'Synthetic nonexistent actor' },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('enforces_the_same_boundary_through_graphql', async () => {
    const response = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.editor}`,
        },
        body: JSON.stringify({
          query: `mutation { createOrganization(draft: true, data: { name: "Synthetic GraphQL", slug: "synthetic-graphql-${randomUUID()}", kind: usg }) { id participating } }`,
        }),
      }),
    )
    const result = await response.json()
    expect(result.errors).toBeUndefined()
    documents.push({ collection: 'organizations', id: result.data.createOrganization.id })
    expect(result.data.createOrganization.participating).toBe(false)
    const publicResponse = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ Organizations(draft: true) { docs { id name } } }' }),
      }),
    )
    expect((await publicResponse.json()).data.Organizations.docs).toEqual([])
  })

  it('denies_direct_database_roles_on_new_tables_and_sequences', async () => {
    const client = await payload.db.pool.connect()
    try {
      for (const role of ['anon', 'authenticated']) {
        const grants = await client.query(
          `select
          has_table_privilege($1, 'organizations', 'SELECT,INSERT,UPDATE,DELETE') as table_access,
          has_table_privilege($1, '_organizations_v', 'SELECT,INSERT,UPDATE,DELETE') as versions_access,
          has_table_privilege($1, 'academic_years', 'SELECT,INSERT,UPDATE,DELETE') as years_access,
          has_table_privilege($1, '_academic_years_v', 'SELECT,INSERT,UPDATE,DELETE') as year_versions_access,
          has_sequence_privilege($1, 'organizations_id_seq', 'USAGE,SELECT,UPDATE') as sequence_access,
          has_sequence_privilege($1, '_organizations_v_id_seq', 'USAGE,SELECT,UPDATE') as version_sequence_access,
          has_sequence_privilege($1, 'academic_years_id_seq', 'USAGE,SELECT,UPDATE') as year_sequence_access,
          has_sequence_privilege($1, '_academic_years_v_id_seq', 'USAGE,SELECT,UPDATE') as year_version_sequence_access`,
          [role],
        )
        expect(Object.values(grants.rows[0])).toEqual(Array(8).fill(false))
        await client.query('begin')
        try {
          await client.query(`set local role "${role}"`)
          await expect(client.query('select id from organizations limit 1')).rejects.toMatchObject({
            code: '42501',
          })
        } finally {
          await client.query('rollback')
        }
      }
    } finally {
      client.release()
    }
  })

  it('allows_a_publisher_to_delete_one_academic_year_draft', async () => {
    const year = await payload.create({
      collection: 'academic-years',
      draft: true,
      user: actor('editor'),
      overrideAccess: false,
      data: { label: `Synthetic deletion ${randomUUID()}` },
    })
    documents.push({ collection: 'academic-years', id: year.id })
    await payload.delete({
      collection: 'academic-years',
      id: year.id,
      user: actor('publisher'),
      overrideAccess: false,
    })
    expect(
      await payload.findByID({ collection: 'academic-years', id: year.id, disableErrors: true }),
    ).toBeNull()
  })

  it('rejects_unsupported_status_values_at_the_server_boundary', async () => {
    const org = await organization()
    for (const _status of ['changed', 'PUBLISHED', true, 42, null])
      expect(
        (
          await request(`/organizations/${org.id}?draft=true`, 'publisher', 'PATCH', {
            _status,
          })
        ).status,
      ).toBe(403)
  })

  it('serializes_two_drafts_claiming_the_same_slug', async () => {
    const first = await organization()
    const second = await organization()
    const slug = `synthetic-concurrent-${randomUUID()}`
    const lock = await payload.db.pool.connect()
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined
    try {
      await lock.query('select pg_advisory_lock(20261020, 1)')
      pending = Promise.allSettled(
        [first, second].map(({ id }) =>
          payload.update({
            collection: 'organizations',
            id,
            draft: true,
            user: actor('editor'),
            overrideAccess: false,
            data: { slug },
          }),
        ),
      )
      await expect
        .poll(async () =>
          Number(
            (
              await payload.db.pool.query(
                "select count(*) from pg_locks where locktype='advisory' and classid=20261020 and objid=1 and not granted",
              )
            ).rows[0].count,
          ),
        )
        .toBeGreaterThanOrEqual(2)
    } finally {
      await lock.query('select pg_advisory_unlock(20261020, 1)')
      lock.release()
      if (pending) {
        const outcomes = await pending
        expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
        expect(outcomes.find(({ status }) => status === 'rejected')).toMatchObject({
          reason: { status: 400 },
        })
      }
    }
  })

  it('cannot_bypass_draft_only_deletion_with_privileged_local_access', async () => {
    const org = await organization()
    await payload.db.pool.query("update organizations set _status='published' where id=$1", [
      org.id,
    ])
    try {
      await expect(
        payload.delete({
          collection: 'organizations',
          id: org.id,
          user: actor('super_admin'),
          overrideAccess: true,
        }),
      ).rejects.toMatchObject({ status: 403 })
    } finally {
      await payload.db.pool.query("update organizations set _status='draft' where id=$1", [org.id])
    }
  })

  it('denies_a_disabled_account_even_with_saved_local_identity', async () => {
    const org = await organization()
    await payload.update({
      collection: 'users',
      id: fixtures.users.editor.id,
      user: actor('super_admin'),
      overrideAccess: false,
      data: { disabled: true },
    })
    await expect(
      payload.update({
        collection: 'organizations',
        id: org.id,
        draft: true,
        user: actor('editor'),
        overrideAccess: true,
        data: { name: 'Synthetic disabled write' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(
      (await request(`/organizations/${org.id}?draft=true`, 'editor')).status,
    ).toBeGreaterThanOrEqual(400)
    expect(
      (
        await request('/organizations?draft=true', 'editor', 'POST', {
          name: 'Synthetic disabled create',
        })
      ).status,
    ).toBe(403)
  })
})
