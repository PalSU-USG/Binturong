import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, handleEndpoints, type Payload } from 'payload'
import { GRAPHQL_POST } from '@payloadcms/next/routes'

import config from '@/payload.config'
import { userRoles, type UserRole } from '@/access/roles'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'

type MetadataCollection = 'organizations' | 'academic-years' | 'offices' | 'people' | 'activities'

describe('domain directory references', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const documents: { collection: MetadataCollection; id: number }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })

  afterAll(async () => {
    const remaining = [...documents].reverse()
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
            })
          remaining.splice(index, 1)
          removed++
        } catch (error) {
          if (!(error instanceof Error && 'status' in error && error.status === 409)) throw error
        }
      }
      if (!removed) throw new Error('Synthetic reference cleanup cannot make progress')
    }
    if (fixtures)
      await removeTestAccounts(
        payload,
        Object.values(fixtures.users).map(({ id }) => id),
      )
  })

  const actor = (role: UserRole = 'editor') => ({
    ...fixtures.users[role],
    collection: 'users' as const,
  })
  function keep<T extends { id: number }>(collection: MetadataCollection, doc: T): T {
    documents.push({ collection, id: doc.id })
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
        data: { name: `Synthetic organization ${randomUUID()}`, kind: 'csg' },
      }),
    )
  }
  async function year(data: Record<string, unknown> = {}) {
    return keep(
      'academic-years',
      await payload.create({
        collection: 'academic-years',
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: { label: `Synthetic year ${randomUUID()}`, ...data },
      }),
    )
  }
  async function office(data: Record<string, unknown> = {}, role: UserRole = 'editor') {
    return keep(
      'offices',
      await payload.create({
        collection: 'offices',
        draft: true,
        overrideAccess: false,
        user: actor(role),
        data: { name: `Synthetic office ${randomUUID()}`, ...data },
      }),
    )
  }
  async function person(data: Record<string, unknown> = {}, role: UserRole = 'editor') {
    return keep(
      'people',
      await payload.create({
        collection: 'people',
        draft: true,
        overrideAccess: false,
        user: actor(role),
        data: { name: `Synthetic person ${randomUUID()}`, ...data },
      }),
    )
  }
  async function activity(data: Record<string, unknown> = {}, role: UserRole = 'editor') {
    return keep(
      'activities',
      await payload.create({
        collection: 'activities',
        draft: true,
        overrideAccess: false,
        user: actor(role),
        data: { title: `Synthetic activity ${randomUUID()}`, ...data },
      }),
    )
  }
  function updateOffice(id: number, data: Record<string, unknown>) {
    return payload.update({
      collection: 'offices',
      id,
      draft: true,
      overrideAccess: false,
      user: actor(),
      data,
    })
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
    it(`${role}_prepares_private_offices_people_and_activities`, async () => {
      const org = await organization()
      const academicYear = await year()
      const sourceOffice = await office({ organization: org.id }, role)
      expect(sourceOffice.branch ?? null).toBeNull()
      const publicPerson = await person(
        { terms: [{ office: sourceOffice.id, academicYear: academicYear.id }] },
        role,
      )
      expect(publicPerson.terms?.[0].startDate ?? null).toBeNull()
      const event = await activity({ organization: org.id, academicYear: academicYear.id }, role)
      expect(event.eventDate ?? null).toBeNull()
      expect(event.time ?? null).toBeNull()
      expect(event.location ?? null).toBeNull()
      for (const [collection, id] of [
        ['offices', sourceOffice.id],
        ['people', publicPerson.id],
        ['activities', event.id],
      ] as const) {
        const response = await request(`/${collection}/${id}?draft=true&depth=2`, role)
        expect(response.status).toBe(200)
        expect((await response.json())._status).toBe('draft')
        expect((await request(`/${collection}/${id}?draft=true&depth=2`)).status).toBe(404)
        expect(
          (
            await request(`/${collection}/${id}?draft=true`, role, 'PATCH', {
              _status: 'published',
            })
          ).status,
        ).toBe(403)
      }
    })
  }

  it('allows_incomplete_drafts_without_account_links_or_invented_structure', async () => {
    const entry = await person({ name: null })
    const unit = await office({ name: null })
    const event = await activity({ title: null })
    expect(entry.name ?? null).toBeNull()
    expect(unit.organization ?? null).toBeNull()
    expect(unit.branch ?? null).toBeNull()
    expect(event.organization ?? null).toBeNull()
    expect(entry).not.toHaveProperty('user')
    expect(
      (
        await request('/people?draft=true', 'super_admin', 'POST', {
          name: 'Synthetic forged account link',
          user: fixtures.users.super_admin.id,
        })
      ).status,
    ).toBe(403)
  })

  it('rejects_missing_or_malformed_supplied_references', async () => {
    const org = await organization()
    for (const value of [2147483647, true, -1, 1.5, `${org.id}junk`])
      await expect(office({ organization: value })).rejects.toMatchObject({ status: 400 })
    await expect(office({ organization: org.id, parent: 2147483647 })).rejects.toMatchObject({
      status: 400,
    })
    await expect(person({ terms: [{ office: 2147483647 }] })).rejects.toMatchObject({ status: 400 })
    await expect(
      activity({ organization: org.id, academicYear: 2147483647 }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects_cross_organization_parents_and_self_or_multi_node_cycles', async () => {
    const org = await organization()
    const other = await organization()
    const root = await office({ organization: org.id })
    await expect(office({ organization: other.id, parent: root.id })).rejects.toMatchObject({
      status: 400,
    })
    await expect(updateOffice(root.id, { parent: root.id })).rejects.toMatchObject({ status: 400 })
    const middle = await office({ organization: org.id, parent: root.id })
    const leaf = await office({ organization: org.id, parent: middle.id })
    await expect(updateOffice(root.id, { parent: leaf.id })).rejects.toMatchObject({ status: 400 })
    expect(
      (await payload.findByID({ collection: 'offices', id: root.id, draft: true })).parent ?? null,
    ).toBeNull()
  })

  it('checks_parent_organization_in_both_saved_states', async () => {
    const first = await organization()
    const second = await organization()
    const root = await office({ organization: first.id })
    await updateOffice(root.id, { organization: second.id })
    await expect(office({ organization: first.id, parent: root.id })).rejects.toMatchObject({
      status: 400,
    })
    await expect(office({ organization: second.id, parent: root.id })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('keeps_referenced_office_drafts_editable_when_organization_is_unchanged', async () => {
    const original = await organization()
    const next = await organization()
    const sourceOffice = await office({ organization: original.id })
    await updateOffice(sourceOffice.id, { organization: next.id })
    await person({ terms: [{ office: sourceOffice.id }] })
    const updated = await updateOffice(sourceOffice.id, { name: 'Synthetic corrected office name' })
    expect(updated.name).toBe('Synthetic corrected office name')
    expect(
      typeof updated.organization === 'object' ? updated.organization?.id : updated.organization,
    ).toBe(next.id)
    expect(
      (await payload.findByID({ collection: 'offices', id: sourceOffice.id, depth: 0 }))
        .organization,
    ).toBe(original.id)
    await expect(
      updateOffice(sourceOffice.id, { organization: original.id }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('rejects_a_cycle_inside_a_caller_transaction_without_committing_it', async () => {
    const org = await organization()
    const root = await office({ organization: org.id })
    const transactionID = await payload.db.beginTransaction()
    if (!transactionID) throw new Error('Native transaction unavailable')
    const req = await createLocalReq({ user: actor() }, payload)
    req.transactionID = transactionID
    try {
      await expect(
        payload.update({
          collection: 'offices',
          id: root.id,
          draft: true,
          overrideAccess: false,
          req,
          data: { parent: root.id },
        }),
      ).rejects.toMatchObject({ status: 400 })
    } finally {
      if (payload.db.sessions?.[transactionID]) await payload.db.rollbackTransaction(transactionID)
    }
    expect(
      (await payload.findByID({ collection: 'offices', id: root.id, draft: true })).parent ?? null,
    ).toBeNull()
  })

  it('reports_reference_field_errors_through_rest_without_persisting_a_revision', async () => {
    const org = await organization()
    const root = await office({ organization: org.id })
    const before = await payload.countVersions({
      collection: 'offices',
      where: { parent: { equals: root.id } },
    })
    const response = await request(`/offices/${root.id}?draft=true`, 'editor', 'PATCH', {
      parent: 2147483647,
    })
    expect(response.status).toBe(400)
    expect((await response.json()).errors[0].data.errors[0].path).toBe('parent')
    expect(
      (
        await payload.countVersions({
          collection: 'offices',
          where: { parent: { equals: root.id } },
        })
      ).totalDocs,
    ).toBe(before.totalDocs)
  })

  it('preserves_directory_relationships_and_privacy_through_graphql', async () => {
    const org = await organization()
    const sourceOffice = await office({ organization: org.id })
    const response = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.editor}`,
        },
        body: JSON.stringify({
          query: `mutation { createPerson(draft: true, data: { name: "Synthetic GraphQL person", slug: "synthetic-person-${randomUUID()}", terms: [{ office: ${sourceOffice.id} }] }) { id terms { office { id name } } } }`,
        }),
      }),
    )
    const result = await response.json()
    expect(result.errors).toBeUndefined()
    keep('people', result.data.createPerson)
    expect(result.data.createPerson.terms[0].office.id).toBe(sourceOffice.id)
    const publicResponse = await GRAPHQL_POST(config)(
      new Request('http://127.0.0.1:3003/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '{ People(draft: true) { docs { id name terms { office { id name } } } } }',
        }),
      }),
    )
    expect((await publicResponse.json()).data.People.docs).toEqual([])
  })

  it('checks_both_canonical_and_latest_draft_parent_paths', async () => {
    const org = await organization()
    const root = await office({ organization: org.id })
    const child = await office({ organization: org.id, parent: root.id })
    await updateOffice(child.id, { parent: null })
    // The earlier canonical parent remains reserved until a reviewed transition replaces it.
    await expect(updateOffice(root.id, { parent: child.id })).rejects.toMatchObject({ status: 400 })
    const left = await office({ organization: org.id })
    const right = await office({ organization: org.id })
    await updateOffice(left.id, { parent: right.id })
    await expect(updateOffice(right.id, { parent: left.id })).rejects.toMatchObject({ status: 400 })
  })

  it('serializes_concurrent_reciprocal_parent_writes', async () => {
    const org = await organization()
    const first = await office({ organization: org.id })
    const second = await office({ organization: org.id })
    const lock = await payload.db.pool.connect()
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined
    try {
      await lock.query('select pg_advisory_lock(20261020, 1)')
      pending = Promise.allSettled([
        updateOffice(first.id, { parent: second.id }),
        updateOffice(second.id, { parent: first.id }),
      ])
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

  it('rejects_invalid_supplied_dates_and_reversed_ranges_even_on_partial_drafts', async () => {
    const org = await organization()
    const sourceOffice = await office({ organization: org.id })
    for (const value of ['not-a-date', '2026-02-30', true, 42]) {
      await expect(year({ startDate: value })).rejects.toMatchObject({ status: 400 })
      await expect(
        person({ terms: [{ office: sourceOffice.id, startDate: value }] }),
      ).rejects.toMatchObject({ status: 400 })
      await expect(activity({ organization: org.id, eventDate: value })).rejects.toMatchObject({
        status: 400,
      })
    }
    const academicYear = await year({ startDate: '2026-08-01', endDate: '2027-05-31' })
    await expect(
      payload.update({
        collection: 'academic-years',
        id: academicYear.id,
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: { endDate: '2026-07-31' },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      person({
        terms: [{ office: sourceOffice.id, startDate: '2026-08-01', endDate: '2026-07-31' }],
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('retains_references_in_old_versions_and_blocks_office_reinterpretation', async () => {
    const org = await organization()
    const other = await organization()
    const academicYear = await year()
    const sourceOffice = await office({ organization: org.id })
    const entry = await person()
    await payload.update({
      collection: 'people',
      id: entry.id,
      draft: true,
      overrideAccess: false,
      user: actor(),
      data: { terms: [{ office: sourceOffice.id, academicYear: academicYear.id }] },
    })
    await payload.update({
      collection: 'people',
      id: entry.id,
      draft: true,
      overrideAccess: false,
      user: actor(),
      data: { terms: [] },
    })
    const canonical = await payload.findByID({ collection: 'people', id: entry.id, draft: false })
    const latest = await payload.findByID({ collection: 'people', id: entry.id, draft: true })
    expect(canonical.terms ?? []).toHaveLength(0)
    expect(latest.terms ?? []).toHaveLength(0)
    for (const [collection, id] of [
      ['offices', sourceOffice.id],
      ['academic-years', academicYear.id],
      ['organizations', org.id],
    ] as const)
      await expect(
        payload.delete({ collection, id, user: actor('super_admin'), overrideAccess: true }),
      ).rejects.toMatchObject({ status: 409 })
    await expect(updateOffice(sourceOffice.id, { organization: other.id })).rejects.toMatchObject({
      status: 409,
    })
    expect(
      (
        await payload.findByID({
          collection: 'offices',
          id: sourceOffice.id,
          draft: true,
          depth: 0,
        })
      ).organization,
    ).toBe(org.id)
  })

  it('checks_date_order_against_the_retained_start_on_partial_updates', async () => {
    const academicYear = await year({ startDate: '2026-08-01', endDate: '2027-05-31' })
    await expect(
      payload.update({
        collection: 'academic-years',
        id: academicYear.id,
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: { endDate: '2026-07-31' },
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(
      (await payload.findByID({ collection: 'academic-years', id: academicYear.id, draft: true }))
        .endDate,
    ).toBe('2027-05-31T00:00:00.000Z')
  })

  it('finds_retained_parent_references_beyond_the_first_native_page', async () => {
    const org = await organization()
    const parent = await office({ organization: org.id })
    const child = await office({ organization: org.id })
    await updateOffice(child.id, { parent: parent.id })
    for (let index = 0; index < 11; index++)
      await updateOffice(child.id, { parent: null, name: `Synthetic revision ${index}` })
    await expect(
      payload.delete({
        collection: 'offices',
        id: parent.id,
        user: actor('publisher'),
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('allows_unreferenced_office_organization_changes_and_draft_deletion', async () => {
    const first = await organization()
    const second = await organization()
    const sourceOffice = await office({ organization: first.id })
    const changed = await updateOffice(sourceOffice.id, { organization: second.id })
    expect(
      typeof changed.organization === 'object' ? changed.organization?.id : changed.organization,
    ).toBe(second.id)
    await payload.delete({
      collection: 'offices',
      id: sourceOffice.id,
      user: actor('publisher'),
      overrideAccess: false,
    })
    expect(
      await payload.findByID({ collection: 'offices', id: sourceOffice.id, disableErrors: true }),
    ).toBeNull()
  })

  it('denies_direct_database_roles_on_directory_tables_and_term_versions', async () => {
    for (const role of ['anon', 'authenticated'])
      for (const table of [
        'offices',
        '_offices_v',
        'people',
        '_people_v',
        'people_terms',
        '_people_v_version_terms',
        'activities',
        '_activities_v',
      ]) {
        const result = await payload.db.pool.query(
          'select has_table_privilege($1,$2,$3) as allowed',
          [role, table, 'SELECT,INSERT,UPDATE,DELETE'],
        )
        expect(result.rows[0].allowed).toBe(false)
      }
    for (const role of ['anon', 'authenticated']) {
      for (const table of [
        'offices',
        '_offices_v',
        'people',
        '_people_v',
        '_people_v_version_terms',
        'activities',
        '_activities_v',
      ])
        expect(
          (
            await payload.db.pool.query('select has_sequence_privilege($1,$2,$3) as allowed', [
              role,
              `${table}_id_seq`,
              'USAGE,SELECT,UPDATE',
            ])
          ).rows[0].allowed,
        ).toBe(false)
      const client = await payload.db.pool.connect()
      try {
        await client.query('begin')
        await client.query(`set local role "${role}"`)
        await expect(
          client.query('select office_id from _people_v_version_terms'),
        ).rejects.toMatchObject({ code: '42501' })
      } finally {
        await client.query('rollback')
        client.release()
      }
    }
  })
})
