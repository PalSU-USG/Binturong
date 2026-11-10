import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { listOffices, listParticipatingCsgs, readOffice } from '@/records/governmentQueries'
import { resolveHolders } from '@/records/holders'
import { buildOfficeTree } from '@/records/officeTree'
import { createRecordSectionFixtures } from '../helpers/recordFixtures'

const NOW = new Date('2026-11-09T10:00:00.000Z')
const o = (
  id: number,
  name: string,
  branch: 'executive' | 'judicial' | null,
  parent: number | null = null,
) => ({
  id,
  name,
  slug: `s${id}`,
  branch,
  parent,
})

describe('buildOfficeTree', () => {
  it('groups_by_branch_nests_children_and_sorts_by_name', () => {
    const groups = buildOfficeTree([
      o(1, 'President', 'executive'),
      o(2, 'Aide', 'executive', 1),
      o(3, 'Court', 'judicial'),
      o(4, 'Secretariat', null),
    ])
    expect(groups.map((g) => g.label)).toEqual(['Executive', 'Judicial', 'Other offices'])
    expect(groups[0]!.roots[0]!.children.map((c) => c.name)).toEqual(['Aide'])
  })

  it('moves_children_of_a_missing_parent_up_without_naming_it', () => {
    const groups = buildOfficeTree([o(2, 'Orphan', 'executive', 99)])
    expect(groups[0]!.roots.map((r) => r.name)).toEqual(['Orphan'])
    expect(JSON.stringify(groups)).not.toContain('99')
  })

  it('breaks_parent_cycles_and_self_parents_without_dropping_offices', () => {
    const groups = buildOfficeTree([o(1, 'A', null, 2), o(2, 'B', null, 1), o(3, 'C', null, 3)])
    const names: string[] = []
    const walk = (n: { name: string; children: never[] }) => {
      names.push(n.name)
      n.children.forEach(walk)
    }
    groups.forEach((g) => g.roots.forEach((r) => walk(r as never)))
    expect(names.sort()).toEqual(['A', 'B', 'C'])
    expect(buildOfficeTree([])).toEqual([])
  })
})

describe('resolveHolders', () => {
  const t = (over: object) => ({ name: 'N', ...over })
  it('is_current_only_from_supplied_dates', () => {
    const [none, current, past, future] = [
      resolveHolders([t({})], NOW)[0]!,
      resolveHolders(
        [t({ startDate: '2026-06-01T12:00:00.000Z', endDate: '2027-05-31T12:00:00.000Z' })],
        NOW,
      )[0]!,
      resolveHolders(
        [t({ startDate: '2024-06-01T12:00:00.000Z', endDate: '2025-05-31T12:00:00.000Z' })],
        NOW,
      )[0]!,
      resolveHolders([t({ startDate: '2027-01-01T12:00:00.000Z' })], NOW)[0]!,
    ]
    expect([none.current, none.start, none.end]).toEqual([false, null, null])
    expect(current.current).toBe(true)
    expect(past.current).toBe(false)
    expect(future.current).toBe(false)
  })

  it('supports_open_ended_terms_and_inclusive_end_day', () => {
    expect(resolveHolders([t({ startDate: '2026-01-01T12:00:00.000Z' })], NOW)[0]!.current).toBe(
      true,
    )
    expect(resolveHolders([t({ endDate: '2026-11-09T00:00:00.000Z' })], NOW)[0]!.current).toBe(true)
    expect(resolveHolders([t({ endDate: '2026-11-08T23:59:00.000Z' })], NOW)[0]!.current).toBe(
      false,
    )
  })

  it('falls_back_to_the_academic_year_only_when_the_term_has_no_dates', () => {
    const year = {
      label: 'SY',
      startDate: '2026-06-01T12:00:00.000Z',
      endDate: '2027-05-31T12:00:00.000Z',
    }
    expect(resolveHolders([t({ academicYear: year })], NOW)[0]).toMatchObject({
      current: true,
      academicYear: 'SY',
    })
    const own = t({
      academicYear: year,
      startDate: '2020-01-01T12:00:00.000Z',
      endDate: '2020-12-31T12:00:00.000Z',
    })
    expect(resolveHolders([own], NOW)[0]!.current).toBe(false)
    expect(resolveHolders([t({ academicYear: { label: 'Undated' } })], NOW)[0]).toMatchObject({
      current: false,
      start: null,
    })
  })

  it('keeps_past_terms_and_lists_current_first', () => {
    const list = resolveHolders(
      [
        {
          name: 'Past',
          startDate: '2020-01-01T12:00:00.000Z',
          endDate: '2021-01-01T12:00:00.000Z',
        },
        { name: 'Now', startDate: '2026-01-01T12:00:00.000Z' },
        { name: 'Unknown' },
      ],
      NOW,
    )
    expect(list.map((h) => h.name)).toEqual(['Now', 'Past', 'Unknown'])
  })
})

describe('government queries', () => {
  let payload: Payload
  let fx: ReturnType<typeof createRecordSectionFixtures>
  let usg: { id: number; name: string }

  beforeAll(async () => {
    payload = await getPayload({ config })
    fx = createRecordSectionFixtures(payload)
    usg = await fx.org({ name: `USG ${fx.tag}` })
  })
  afterAll(async () => {
    await fx?.cleanup()
  })

  it('lists_only_published_offices_of_published_usg_organizations', async () => {
    const ok = await fx.office({ organization: usg.id, name: `Visible ${fx.tag}` })
    const draft = await fx.office({
      organization: usg.id,
      name: `Draft ${fx.tag}`,
      status: 'draft',
    })
    const csg = await fx.org({ kind: 'csg' })
    const foreign = await fx.office({ organization: csg.id, name: `Foreign ${fx.tag}` })
    const hiddenOrg = await fx.org({ status: 'draft' })
    const underHidden = await fx.office({ organization: hiddenOrg.id, name: `Hidden ${fx.tag}` })
    const names = (await listOffices(payload)).map((x) => x.name)
    expect(names).toContain(ok.name)
    for (const n of [draft.name, foreign.name, underHidden.name]) expect(names).not.toContain(n)
  })

  it('reads_an_office_with_published_relations_holders_and_no_hidden_titles', async () => {
    const parent = await fx.office({
      organization: usg.id,
      name: `Parent ${fx.tag}`,
      branch: 'executive',
    })
    const hiddenParent = await fx.office({
      organization: usg.id,
      name: `HiddenParent ${fx.tag}`,
      status: 'draft',
    })
    const office = await fx.office({
      organization: usg.id,
      name: `Main ${fx.tag}`,
      parent: parent.id,
    })
    const child = await fx.office({
      organization: usg.id,
      name: `Child ${fx.tag}`,
      parent: office.id,
    })
    const hiddenChild = await fx.office({
      organization: usg.id,
      name: `HiddenChild ${fx.tag}`,
      parent: office.id,
      status: 'draft',
    })
    const year = await fx.year({
      label: `AY ${fx.tag}`,
      startDate: '2026-06-01T12:00:00.000Z',
      endDate: '2027-05-31T12:00:00.000Z',
    })
    await fx.person({
      name: `Holder ${fx.tag}`,
      terms: [{ office: office.id, academicYear: year.id }, { office: parent.id }],
    })
    await fx.person({
      name: `Past ${fx.tag}`,
      terms: [
        {
          office: office.id,
          startDate: '2020-01-01T12:00:00.000Z',
          endDate: '2021-01-01T12:00:00.000Z',
        },
      ],
    })
    await fx.person({
      name: `DraftPerson ${fx.tag}`,
      status: 'draft',
      terms: [{ office: office.id }],
    })
    const page = await readOffice(payload, office.slug, NOW)
    expect(page).toMatchObject({
      name: office.name,
      organization: usg.name,
      parent: { name: parent.name },
    })
    expect(page!.children.map((c) => c.name)).toEqual([child.name])
    expect(page!.holders.map((h) => [h.name, h.current])).toEqual([
      [`Holder ${fx.tag}`, true],
      [`Past ${fx.tag}`, false],
    ])
    const text = JSON.stringify(page)
    for (const hidden of [hiddenChild.name, `DraftPerson ${fx.tag}`])
      expect(text).not.toContain(hidden)
    const orphan = await fx.office({ organization: usg.id, parent: hiddenParent.id })
    expect((await readOffice(payload, orphan.slug, NOW))!.parent).toBeNull()
    expect(JSON.stringify(await readOffice(payload, orphan.slug, NOW))).not.toContain(
      'HiddenParent',
    )
  })

  it('returns_null_for_unpublished_unknown_and_hostile_office_slugs', async () => {
    const draft = await fx.office({ organization: usg.id, status: 'draft' })
    for (const slug of [draft.slug, 'nope', '', "' or 1=1 --", 'x'.repeat(500)])
      expect(await readOffice(payload, slug, NOW)).toBeNull()
  })

  it('lists_only_published_participating_csgs', async () => {
    const yes = await fx.org({ name: `Yes ${fx.tag}`, kind: 'csg', participating: true })
    const no = await fx.org({ name: `No ${fx.tag}`, kind: 'csg', participating: false })
    const draft = await fx.org({
      name: `Draft ${fx.tag}`,
      kind: 'csg',
      participating: true,
      status: 'draft',
    })
    const other = await fx.org({
      name: `Unit ${fx.tag}`,
      kind: 'university_unit',
      participating: true,
    })
    const names = (await listParticipatingCsgs(payload)).map((c) => c.name)
    expect(names).toContain(yes.name)
    for (const n of [no.name, draft.name, other.name]) expect(names).not.toContain(n)
  })
})
