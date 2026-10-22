import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, handleEndpoints, type Payload } from 'payload'
import { GRAPHQL_POST } from '@payloadcms/next/routes'

import config from '@/payload.config'
import { userRoles, type UserRole } from '@/access/roles'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'
import { syntheticContent } from '../helpers/contentFixtures'

type RecordCollection = 'issuances' | 'reports'
type FixtureCollection = RecordCollection | 'organizations' | 'offices' | 'activities' | 'posts'

describe('formal record drafts and sealed documents', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const documents: number[] = []
  const records: { collection: FixtureCollection; id: number }[] = []
  const actor = (role: UserRole = 'editor') => ({
    ...fixtures.users[role],
    collection: 'users' as const,
  })

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    await removeRows(
      records.filter(({ collection }) => ['issuances', 'reports'].includes(collection)),
    )
    // Exact test-only rows were inserted through the adapter to exercise forged readiness.
    for (const id of documents)
      await payload.db.pool.query('delete from documents where id=$1 and title like $2', [
        id,
        'Synthetic %',
      ])
    await removeRows(
      records.filter(({ collection }) => !['issuances', 'reports'].includes(collection)),
    )
    if (fixtures)
      await removeTestAccounts(
        payload,
        Object.values(fixtures.users).map(({ id }) => id),
      )
  })

  async function removeRows(rows: typeof records) {
    const remaining = [...rows].reverse()
    while (remaining.length) {
      let removed = 0
      for (let index = remaining.length - 1; index >= 0; index--) {
        const { collection, id } = remaining[index]
        try {
          if (await payload.findByID({ collection, id, disableErrors: true }))
            await payload.delete({
              collection,
              id,
              user: actor('super_admin'),
              overrideAccess: false,
              context: { disableRevalidate: true },
            })
          remaining.splice(index, 1)
          removed++
        } catch (error) {
          if (!(error instanceof Error && 'status' in error && error.status === 409)) throw error
        }
      }
      if (!removed) throw new Error('Synthetic formal-record cleanup cannot make progress')
    }
  }

  function keep<T extends { id: number }>(collection: FixtureCollection, doc: T): T {
    records.push({ collection, id: doc.id })
    return doc
  }
  async function organization() {
    return keep(
      'organizations',
      await payload.create({
        collection: 'organizations',
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: { name: `Synthetic source ${randomUUID()}`, kind: 'usg' },
      }),
    )
  }
  async function office(organization: number) {
    return keep(
      'offices',
      await payload.create({
        collection: 'offices',
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: { name: `Synthetic office ${randomUUID()}`, organization },
      }),
    )
  }
  async function record(
    collection: RecordCollection,
    data: Record<string, unknown> = {},
    role: UserRole = 'editor',
  ) {
    const doc = await payload.create({
      collection,
      draft: true,
      overrideAccess: false,
      user: actor(role),
      data: { title: `Synthetic record ${randomUUID()}`, ...data },
    })
    return keep(collection, doc)
  }
  async function sealedFixture(organization: number) {
    const row = await payload.db.create({
      collection: 'documents',
      data: {
        organization,
        title: `Synthetic unverified PDF ${randomUUID()}`,
        state: 'ready',
        storageKey: `private/synthetic-${randomUUID()}.pdf`,
        originalFilename: 'synthetic.pdf',
        mimeType: 'application/pdf',
        size: 100,
        sha256: 'f'.repeat(64),
      },
    })
    documents.push(row.id)
    return row
  }
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

  for (const role of userRoles) {
    it(`${role}_can_prepare_incomplete_structured_record_drafts`, async () => {
      for (const collection of ['issuances', 'reports'] as const) {
        const doc = await record(collection, { title: null }, role)
        expect(doc.title ?? null).toBeNull()
        expect(doc.organization ?? null).toBeNull()
        expect(doc.mainDocument ?? null).toBeNull()
        expect((await request(`/${collection}/${doc.id}?draft=true`, role)).status).toBe(200)
        expect((await request(`/${collection}/${doc.id}?draft=true`)).status).toBe(404)
        for (const overrideAccess of [false, true])
          await expect(
            payload.update({
              collection,
              id: doc.id,
              user: actor(role),
              overrideAccess,
              data: { _status: 'published' },
            }),
          ).rejects.toMatchObject({ status: 403 })
      }
    })

    it(`${role}_cannot_mutate_document_metadata_even_with_local_overrides`, async () => {
      const org = await organization()
      const file = await sealedFixture(org.id)
      for (const overrideAccess of [false, true]) {
        await expect(
          payload
            .create({
              collection: 'documents',
              user: actor(role),
              overrideAccess,
              data: {
                title: 'Synthetic forged file',
                organization: org.id,
                state: 'ready',
                storageKey: 'forged',
              },
            })
            .then((doc) => {
              documents.push(doc.id)
              return doc
            }),
        ).rejects.toMatchObject({ status: 403 })
        await expect(
          payload.update({
            collection: 'documents',
            id: file.id,
            user: actor(role),
            overrideAccess,
            data: { state: 'ready', sha256: '0'.repeat(64) },
          }),
        ).rejects.toMatchObject({ status: 403 })
        await expect(
          payload.delete({
            collection: 'documents',
            id: file.id,
            user: actor(role),
            overrideAccess,
          }),
        ).rejects.toMatchObject({ status: 403 })
      }
      expect((await request(`/documents/${file.id}`, role)).status).toBe(200)
      expect((await request(`/documents/${file.id}`)).status).toBe(403)
      expect(
        (await request(`/documents/${file.id}`, role, 'PATCH', { state: 'ready' })).status,
      ).toBe(403)
    })
  }

  it('denies_anonymous_privileged_document_writes_and_native_file_delivery', async () => {
    const org = await organization()
    await expect(
      payload.create({
        collection: 'documents',
        overrideAccess: true,
        data: {
          title: 'Synthetic anonymous file',
          organization: org.id,
          state: 'ready',
          storageKey: 'forged',
        },
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect((await request('/documents/file/synthetic.pdf')).status).toBe(404)
    const publicResult = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ Documents { docs { id storageKey sha256 } } }' }),
      }),
    )
    expect(JSON.stringify(await publicResult.json())).not.toContain('private/synthetic-')
    const forged = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.super_admin}`,
        },
        body: JSON.stringify({
          query:
            'mutation { createDocument(data: { title: "Synthetic forged GraphQL", state: ready, storageKey: "forged", organization: 2147483647 }) { id } }',
        }),
      }),
    )
    expect((await forged.json()).errors?.[0].extensions.statusCode).toBe(403)
  })

  it('preserves_trusted_cleanup_of_unreferenced_legacy_post_drafts', async () => {
    const post = keep(
      'posts',
      await payload.create({
        collection: 'posts',
        draft: true,
        overrideAccess: false,
        user: actor(),
        context: { disableRevalidate: true },
        data: {
          title: `Synthetic legacy post ${randomUUID()}`,
          slug: `synthetic-${randomUUID()}`,
          content: syntheticContent,
        },
      }),
    )
    await payload.delete({
      collection: 'posts',
      id: post.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    expect(
      await payload.findByID({ collection: 'posts', id: post.id, disableErrors: true }),
    ).toBeNull()
  })

  it('preserves_manual_unlimited_formal_history_without_changing_posts_or_media', async () => {
    for (const collection of ['issuances', 'reports'] as const) {
      const doc = await record(collection)
      for (let index = 0; index < 51; index++)
        await payload.update({
          collection,
          id: doc.id,
          draft: true,
          overrideAccess: false,
          user: actor(),
          data: { title: `Synthetic retained revision ${index}` },
        })
      expect(
        (await payload.countVersions({ collection, where: { parent: { equals: doc.id } } }))
          .totalDocs,
      ).toBe(52)
    }
    expect(
      payload.collections.posts.config.versions &&
        payload.collections.posts.config.versions.maxPerDoc,
    ).toBe(50)
    expect(payload.collections.documents.config.upload).toBe(false)
    expect(
      payload.collections.media.config.upload && payload.collections.media.config.upload.staticDir,
    ).toContain('public')
  })

  it('rejects_missing_references_bad_source_dates_and_cross_organization_offices', async () => {
    const org = await organization()
    const other = await organization()
    const foreign = await office(other.id)
    await expect(
      record('issuances', { organization: org.id, issuingOffice: foreign.id }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      record('reports', { organization: org.id, responsibleOffices: [foreign.id] }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      record('issuances', { organization: org.id, mainDocument: 2147483647 }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(record('issuances', { issuedDate: '2026-02-30' })).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      record('reports', { periodStartDate: '2026-08-01', periodEndDate: '2026-07-31' }),
    ).rejects.toMatchObject({ status: 400 })
    const file = await sealedFixture(other.id)
    await expect(
      record('issuances', { organization: org.id, mainDocument: file.id }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('keeps_retained_office_references_after_later_record_edits', async () => {
    const org = await organization()
    const sourceOffice = await office(org.id)
    for (const collection of ['issuances', 'reports'] as const) {
      const doc = await record(collection)
      const field = collection === 'issuances' ? 'issuingOffice' : 'responsibleOffices'
      await payload.update({
        collection,
        id: doc.id,
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: {
          organization: org.id,
          [field]: collection === 'issuances' ? sourceOffice.id : [sourceOffice.id],
        },
      })
      await payload.update({
        collection,
        id: doc.id,
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: { [field]: collection === 'issuances' ? null : [] },
      })
    }
    await expect(
      payload.delete({
        collection: 'offices',
        id: sourceOffice.id,
        user: actor('publisher'),
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('reports_complete_candidate_errors_before_the_unavailable_storage_error', async () => {
    const { validateOfficialCandidate } = await import('@/collections/shared/officialFiles')
    const req = await createLocalReq({ user: actor('publisher') }, payload)
    await expect(validateOfficialCandidate(req, 'issuances', {})).rejects.toMatchObject({
      status: 400,
      data: { errors: expect.arrayContaining([{ path: 'title', message: expect.any(String) }]) },
    })
    const org = await organization()
    const file = await sealedFixture(org.id)
    const candidate = {
      title: 'Synthetic complete issuance',
      slug: `synthetic-${randomUUID()}`,
      organization: org.id,
      type: 'memorandum',
      documentNumber: '001-A',
      seriesYear: 2026,
      mainDocument: file.id,
    }
    await expect(
      validateOfficialCandidate(req, 'issuances', { ...candidate, documentNumber: ' ' }),
    ).rejects.toMatchObject({
      status: 400,
      data: {
        errors: expect.arrayContaining([{ path: 'documentNumber', message: expect.any(String) }]),
      },
    })
    await expect(validateOfficialCandidate(req, 'issuances', candidate)).rejects.toMatchObject({
      status: 400,
      data: {
        errors: expect.arrayContaining([
          { path: 'mainDocument', message: expect.stringContaining('storage') },
        ]),
      },
    })
    await expect(
      validateOfficialCandidate(req, 'reports', { ...candidate, type: 'financial' }),
    ).rejects.toMatchObject({
      status: 400,
      data: {
        errors: expect.arrayContaining([{ path: 'reportingPeriod', message: expect.any(String) }]),
      },
    })
  })

  it('requires_a_series_year_when_an_advisory_has_a_source_number', async () => {
    const { validateOfficialCandidate } = await import('@/collections/shared/officialFiles')
    const req = await createLocalReq({ user: actor('publisher') }, payload)
    const org = await organization()
    const file = await sealedFixture(org.id)
    const candidate = {
      title: 'Synthetic advisory',
      slug: `synthetic-${randomUUID()}`,
      organization: org.id,
      type: 'advisory',
      mainDocument: file.id,
    }
    await expect(validateOfficialCandidate(req, 'issuances', candidate)).rejects.toMatchObject({
      status: 400,
      data: { errors: [{ path: 'mainDocument', message: expect.stringContaining('storage') }] },
    })
    await expect(
      validateOfficialCandidate(req, 'issuances', { ...candidate, documentNumber: '001' }),
    ).rejects.toMatchObject({
      status: 400,
      data: {
        errors: expect.arrayContaining([{ path: 'seriesYear', message: expect.any(String) }]),
      },
    })
  })

  it('hides_private_file_metadata_and_draft_related_titles_in_public_relationships', async () => {
    const org = await organization()
    const file = await sealedFixture(org.id)
    const privateTitle = `Synthetic private activity ${randomUUID()}`
    const activity = keep(
      'activities',
      await payload.create({
        collection: 'activities',
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: { title: privateTitle, organization: org.id },
      }),
    )
    const report = await record('reports', {
      organization: org.id,
      mainDocument: file.id,
      relatedRecords: [{ relationTo: 'activities', value: activity.id }],
    })
    // An isolated synthetic canonical row exercises public reads before transitions exist.
    await payload.db.pool.query("update reports set _status='published' where id=$1", [report.id])
    try {
      const response = await request(`/reports/${report.id}?depth=3`)
      expect(response.status).toBe(200)
      const body = JSON.stringify(await response.json())
      for (const privateValue of [privateTitle, file.storageKey, file.sha256, file.title])
        expect(body).not.toContain(privateValue)
    } finally {
      await payload.db.pool.query("update reports set _status='draft' where id=$1", [report.id])
    }
  })

  it('distinguishes_polymorphic_ids_and_retains_removed_related_records', async () => {
    let target = await record('reports')
    for (
      let attempt = 0;
      attempt < 10 &&
      (await payload.findByID({ collection: 'activities', id: target.id, disableErrors: true }));
      attempt++
    )
      target = await record('reports')
    expect(
      await payload.findByID({ collection: 'activities', id: target.id, disableErrors: true }),
    ).toBeNull()
    const collision = (
      await payload.db.pool.query<{ id: number }>(
        "insert into activities (id,title,slug,_status) values ($1,$2,$3,'draft') returning id",
        [target.id, 'Synthetic independent activity ID', `synthetic-${randomUUID()}`],
      )
    ).rows[0]
    keep('activities', collision)
    expect(collision.id).toBe(target.id)
    const source = await record('issuances')
    await payload.update({
      collection: 'issuances',
      id: source.id,
      draft: true,
      user: actor(),
      overrideAccess: false,
      data: { relatedRecords: [{ relationTo: 'reports', value: target.id }] },
    })
    await payload.update({
      collection: 'issuances',
      id: source.id,
      draft: true,
      user: actor(),
      overrideAccess: false,
      data: { relatedRecords: [] },
    })
    await expect(
      payload.delete({
        collection: 'activities',
        id: collision.id,
        user: actor('publisher'),
        overrideAccess: false,
      }),
    ).resolves.toMatchObject({ id: collision.id })
    await expect(
      payload.delete({
        collection: 'reports',
        id: target.id,
        user: actor('publisher'),
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('denies_direct_database_roles_on_all_formal_record_objects', async () => {
    const tables = [
      'documents',
      'issuances',
      'issuances_rels',
      '_issuances_v',
      '_issuances_v_rels',
      'reports',
      'reports_rels',
      '_reports_v',
      '_reports_v_rels',
    ]
    for (const role of ['anon', 'authenticated']) {
      for (const table of tables) {
        expect(
          (
            await payload.db.pool.query('select has_table_privilege($1,$2,$3) as allowed', [
              role,
              table,
              'SELECT,INSERT,UPDATE,DELETE',
            ])
          ).rows[0].allowed,
        ).toBe(false)
        expect(
          (
            await payload.db.pool.query('select has_sequence_privilege($1,$2,$3) as allowed', [
              role,
              `${table}_id_seq`,
              'USAGE,SELECT,UPDATE',
            ])
          ).rows[0].allowed,
        ).toBe(false)
      }
      const client = await payload.db.pool.connect()
      try {
        await client.query('begin')
        await client.query(`set local role "${role}"`)
        await expect(client.query('select storage_key from documents')).rejects.toMatchObject({
          code: '42501',
        })
      } finally {
        await client.query('rollback')
        client.release()
      }
    }
  })

  it('reports_unknown_supplied_record_types_as_field_errors', async () => {
    for (const collection of ['issuances', 'reports'] as const)
      for (const type of ['unexpected', true, 42]) {
        const response = await request(`/${collection}?draft=true`, 'editor', 'POST', {
          title: 'Synthetic invalid record type',
          type,
        })
        const result = await response.json()
        if (response.status === 200 || response.status === 201)
          keep(collection, result.doc ?? result)
        expect(response.status).toBe(400)
        expect(result.errors[0].data.errors[0].path).toBe('type')
      }
  })
})
