import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import RichText from '@/components/RichText'
import { parseRecordFilters, type RecordFilters } from '@/records/recordFilters'
import {
  listActivities,
  listRecords,
  readPublicActivity,
  readPublicRecord,
} from '@/records/recordQueries'
import { createRecordSectionFixtures } from '../helpers/recordFixtures'

vi.mock('@/blocks/MediaBlock/Component', () => ({ MediaBlock: () => null }))
vi.mock('@/blocks/Code/Component', () => ({ CodeBlock: () => null }))
vi.mock('@/blocks/Banner/Component', () => ({ BannerBlock: () => null }))
vi.mock('@/blocks/CallToAction/Component', () => ({ CallToActionBlock: () => null }))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

const DAY = 86_400_000
const NOW = new Date('2026-11-09T00:00:00.000Z')
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()

describe('parseRecordFilters', () => {
  it('never_throws_and_defaults_invalid_input', () => {
    for (const bad of [undefined, '', '0', '-1', '1.5', 'abc', '1e3', ['x']]) {
      const filters = parseRecordFilters({ page: bad as string }, 'archives')
      expect(filters.page).toBe(1)
    }
    expect(parseRecordFilters({ page: '3', year: ['a', 'b'] }, 'archives')).toMatchObject({
      page: 3,
      year: 'a',
    })
  })

  it('caps_depth_and_reports_what_it_ignored', () => {
    const deep = parseRecordFilters({ page: '9999' }, 'archives')
    expect(deep.page).toBe(50)
    expect(deep.notices.join(' ')).toMatch(/page/i)
    const unknown = parseRecordFilters({ type: 'nope' }, 'archives')
    expect(unknown.type).toBeNull()
    expect(unknown.notices.join(' ')).toMatch(/type/i)
    expect(parseRecordFilters({ type: 'memorandum' }, 'executive').type).toBe('memorandum')
  })

  it('ignores_type_on_transparency_pages_and_csg_elsewhere', () => {
    expect(parseRecordFilters({ type: 'memorandum' }, 'financial')).toMatchObject({
      type: null,
      notices: [],
    })
    expect(parseRecordFilters({ csg: 'x' }, 'archives').csg).toBeNull()
    expect(parseRecordFilters({ csg: 'x' }, 'csg').csg).toBe('x')
  })
})

describe('record queries', () => {
  let payload: Payload
  let fx: ReturnType<typeof createRecordSectionFixtures>
  let usg: { id: number; name: string }
  let csgOrg: { id: number; name: string; slug: string }
  let year: { id: number; label: string; slug: string }
  let exec: { id: number; slug: string }
  let judicial: { id: number }
  let unbranched: { id: number }
  let hiddenOffice: { id: number }
  let file: number
  let pendingFile: number

  const filters = (over: Partial<RecordFilters> = {}): RecordFilters => ({
    page: 1,
    year: year.slug,
    type: null,
    csg: null,
    notices: [],
    ...over,
  })
  const titles = (rows: { title: string }[]) => rows.map((r) => r.title)

  beforeAll(async () => {
    payload = await getPayload({ config })
    fx = createRecordSectionFixtures(payload)
    usg = await fx.org({ name: `USG ${fx.tag}` })
    csgOrg = await fx.org({ name: `CSG ${fx.tag}`, kind: 'csg', participating: false })
    year = await fx.year({ label: `Year ${fx.tag}` })
    exec = await fx.office({ organization: usg.id, branch: 'executive' })
    judicial = await fx.office({ organization: usg.id, branch: 'judicial' })
    unbranched = await fx.office({ organization: usg.id })
    hiddenOffice = await fx.office({ organization: usg.id, branch: 'executive', status: 'draft' })
    file = await fx.file(usg.id)
    pendingFile = await fx.file(usg.id, { state: 'pending' })
  })
  afterAll(async () => {
    await fx?.cleanup()
  })

  const issuance = (o: Partial<Parameters<typeof fx.issuance>[0]> = {}) =>
    fx.issuance({ organization: usg.id, mainDocument: file, academicYear: year.id, ...o })
  const report = (o: Partial<Parameters<typeof fx.report>[0]> = {}) =>
    fx.report({ organization: usg.id, mainDocument: file, academicYear: year.id, ...o })

  it('lists_only_published_records_with_canonical_links_and_ready_pdfs', async () => {
    const visible = await issuance({
      title: `Visible ${fx.tag}`,
      issuingOffice: exec.id,
      type: 'executive_order',
      identifier: '1',
    })
    const draft = await issuance({ title: `Draft ${fx.tag}`, status: 'draft' })
    const withdrawn = await report({ title: `Withdrawn ${fx.tag}`, status: 'draft' })
    await fx.version('reports', withdrawn.id, { mainDocument: file })
    const noPdf = await report({ title: `Pending ${fx.tag}`, mainDocument: pendingFile })
    const result = await listRecords(payload, 'archives', filters({ year: year.slug }), NOW)
    expect(titles(result.rows)).toEqual(
      expect.arrayContaining([`Visible ${fx.tag}`, `Pending ${fx.tag}`]),
    )
    expect(JSON.stringify(result)).not.toContain(draft.title)
    expect(JSON.stringify(result)).not.toContain(withdrawn.title)
    const row = result.rows.find((r) => r.title === `Visible ${fx.tag}`)!
    expect(row).toMatchObject({
      href: `/issuances/${visible.slug}`,
      identifier: '1',
      citation: `Executive order No. 1, s. Year ${fx.tag}`,
      organization: usg.name,
      fileHref: `/api/documents/${file}/file`,
    })
    expect(result.rows.find((r) => r.title === noPdf.title)).toMatchObject({
      href: `/reports/${noPdf.slug}`,
      fileHref: null,
    })
    expect(JSON.stringify(result)).not.toContain('ready/')
  })

  it('shows_only_the_number_when_the_academic_year_is_missing_or_unpublished', async () => {
    const draftYear = await fx.year({ label: `Hidden year ${fx.tag}`, status: 'draft' })
    // This run's own organization keeps leftover test rows off the page.
    const hidden = await issuance({
      title: `DraftYear ${fx.tag}`,
      organization: csgOrg.id,
      type: 'memorandum',
      identifier: '023',
      academicYear: draftYear.id,
    })
    const none = await issuance({
      title: `NoYear ${fx.tag}`,
      organization: csgOrg.id,
      type: 'memorandum',
      identifier: '024',
      academicYear: undefined,
    })
    const { rows } = await listRecords(
      payload,
      'csg',
      filters({ csg: csgOrg.slug, type: 'memorandum', year: null }),
      NOW,
    )
    expect(rows.find((r) => r.title === hidden.title)?.identifier).toBe('023')
    expect(rows.find((r) => r.title === none.title)?.identifier).toBe('024')
    expect(JSON.stringify(rows)).not.toContain(draftYear.label)
  })

  it('filters_by_branch_and_keeps_unclassified_records_on_archives_only', async () => {
    const e = await issuance({ title: `Exec ${fx.tag}`, issuingOffice: exec.id })
    const j = await report({
      title: `Judicial ${fx.tag}`,
      responsibleOffices: [exec.id, judicial.id],
    })
    const none = await issuance({ title: `NoBranch ${fx.tag}`, issuingOffice: unbranched.id })
    const noOffice = await report({ title: `NoOffice ${fx.tag}` })
    const hidden = await issuance({
      title: `HiddenOffice ${fx.tag}`,
      issuingOffice: hiddenOffice.id,
    })
    const executive = titles((await listRecords(payload, 'executive', filters(), NOW)).rows)
    expect(executive).toEqual(expect.arrayContaining([e.title, j.title]))
    for (const t of [none.title, noOffice.title, hidden.title]) expect(executive).not.toContain(t)
    const judicialRows = titles((await listRecords(payload, 'judicial', filters(), NOW)).rows)
    expect(judicialRows).toContain(j.title)
    expect(judicialRows).not.toContain(e.title)
    expect(titles((await listRecords(payload, 'legislative', filters(), NOW)).rows)).not.toContain(
      e.title,
    )
    const all = titles(
      (await listRecords(payload, 'archives', filters({ year: year.slug }), NOW)).rows,
    )
    expect(all).toEqual(expect.arrayContaining([e.title, none.title, noOffice.title, hidden.title]))
  })

  it('lists_only_published_resolutions_from_published_legislative_offices', async () => {
    const senate = await fx.office({ organization: usg.id, branch: 'legislative' })
    const draftSenate = await fx.office({
      organization: usg.id,
      branch: 'legislative',
      status: 'draft',
    })
    const shown = await issuance({ title: `Res ${fx.tag}`, issuingOffice: senate.id })
    const hidden = [
      await issuance({ title: `Memo ${fx.tag}`, issuingOffice: senate.id, type: 'memorandum' }),
      await issuance({ title: `DraftRes ${fx.tag}`, issuingOffice: senate.id, status: 'draft' }),
      await issuance({ title: `HiddenSenate ${fx.tag}`, issuingOffice: draftSenate.id }),
      await issuance({ title: `ExecRes ${fx.tag}`, issuingOffice: exec.id }),
      await issuance({ title: `NoOfficeRes ${fx.tag}` }),
      await report({ title: `SenateReport ${fx.tag}`, responsibleOffices: [senate.id] }),
    ]
    const rows = titles(
      (await listRecords(payload, 'legislative', filters({ type: 'resolution' }), NOW)).rows,
    )
    expect(rows).toEqual([shown.title])
    for (const { title } of hidden) expect(rows).not.toContain(title)
  })

  it('lists_participating_csg_records_by_organization_kind_and_narrows_by_known_csg', async () => {
    const mine = await issuance({ title: `Csg ${fx.tag}`, organization: csgOrg.id })
    const other = await issuance({ title: `NotCsg ${fx.tag}` })
    const rows = await listRecords(payload, 'csg', filters(), NOW)
    expect(titles(rows.rows)).toContain(mine.title)
    expect(titles(rows.rows)).not.toContain(other.title)
    const narrowed = await listRecords(payload, 'csg', filters({ csg: csgOrg.slug }), NOW)
    expect(titles(narrowed.rows)).toEqual([mine.title])
    const unknown = await listRecords(payload, 'csg', filters({ csg: 'no-such-csg' }), NOW)
    expect(unknown.notices.join(' ')).toMatch(/not found/i)
    expect(titles(unknown.rows)).toContain(mine.title)
  })

  it('splits_transparency_by_report_type', async () => {
    const fin = await report({
      title: `Fin ${fx.tag}`,
      type: 'financial',
      identifier: 'First semester',
    })
    const acc = await report({ title: `Acc ${fx.tag}`, type: 'accomplishment' })
    const iss = await issuance({ title: `Iss ${fx.tag}` })
    const financial = titles((await listRecords(payload, 'financial', filters(), NOW)).rows)
    expect(financial).toContain(fin.title)
    for (const t of [acc.title, iss.title]) expect(financial).not.toContain(t)
    expect(titles((await listRecords(payload, 'accomplishment', filters(), NOW)).rows)).toContain(
      acc.title,
    )
    const row = (await listRecords(payload, 'financial', filters(), NOW)).rows.find(
      (r) => r.title === fin.title,
    )!
    expect(row.identifier).toBe('First semester')
  })

  it('filters_by_issuance_type_and_never_silently_widens_an_unknown_year', async () => {
    const memo = await issuance({ title: `Memo ${fx.tag}`, type: 'memorandum' })
    const act = await issuance({ title: `Act ${fx.tag}`, type: 'act' })
    const rep = await report({ title: `RepT ${fx.tag}` })
    const memos = titles(
      (await listRecords(payload, 'archives', filters({ type: 'memorandum' }), NOW)).rows,
    )
    expect(memos).toContain(memo.title)
    for (const t of [act.title, rep.title]) expect(memos).not.toContain(t)
    const unknownYear = await listRecords(
      payload,
      'archives',
      filters({ year: 'no-such-year' }),
      NOW,
    )
    expect(unknownYear.notices.join(' ')).toMatch(/academic year not found/i)
    expect(unknownYear.total).toBeGreaterThanOrEqual(3)
  })

  it('ignores_an_unpublished_academic_year_as_unknown', async () => {
    const draftYear = await fx.year({ status: 'draft' })
    const result = await listRecords(payload, 'archives', filters({ year: draftYear.slug }), NOW)
    expect(result.notices.join(' ')).toMatch(/academic year not found/i)
  })

  it('orders_archives_by_publication_date_and_labels_recent_without_hiding_old_records', async () => {
    const y = await fx.year()
    const old = await issuance({
      title: `Old ${fx.tag}`,
      academicYear: y.id,
      publishedAt: ago(400),
    })
    const edge = await report({ title: `Edge ${fx.tag}`, academicYear: y.id, publishedAt: ago(31) })
    const fresh = await issuance({
      title: `Fresh ${fx.tag}`,
      academicYear: y.id,
      publishedAt: ago(2),
    })
    const { rows } = await listRecords(payload, 'archives', filters({ year: y.slug }), NOW)
    expect(titles(rows)).toEqual([fresh.title, edge.title, old.title])
    expect(rows.map((r) => r.recent)).toEqual([true, false, false])
    const later = await listRecords(
      payload,
      'archives',
      filters({ year: y.slug }),
      new Date(NOW.getTime() + 60 * DAY),
    )
    expect(titles(later.rows)).toEqual(titles(rows))
    expect(later.rows.map((r) => r.recent)).toEqual([false, false, false])
    expect(later.rows.map((r) => r.href)).toEqual(rows.map((r) => r.href))
  })

  it('pages_a_merged_list_stably_across_equal_dates_and_caps_the_page', async () => {
    const y = await fx.year()
    const same = ago(5)
    for (let i = 0; i < 7; i++) {
      await issuance({ title: `Tie issuance ${i}`, academicYear: y.id, publishedAt: same })
      await report({ title: `Tie report ${i}`, academicYear: y.id, publishedAt: same })
    }
    const f = (page: number) => filters({ year: y.slug, page })
    const one = await listRecords(payload, 'archives', f(1), NOW)
    const two = await listRecords(payload, 'archives', f(2), NOW)
    expect([one.total, one.pageCount, one.rows.length, two.rows.length]).toEqual([14, 2, 12, 2])
    const seen = [...one.rows, ...two.rows].map((r) => r.href)
    expect(new Set(seen).size).toBe(14)
    const again = await listRecords(payload, 'archives', f(1), NOW)
    expect(again.rows.map((r) => r.href)).toEqual(one.rows.map((r) => r.href))
    const past = await listRecords(payload, 'archives', f(50), NOW)
    expect(past.page).toBe(2)
    expect(past.rows).toHaveLength(2)
  })

  it('reads_a_published_record_and_hides_every_unpublished_reference', async () => {
    const liveRelated = await issuance({ title: `Rel live ${fx.tag}` })
    const draftRelated = await issuance({ title: `Rel draft ${fx.tag}`, status: 'draft' })
    const hiddenOrg = await fx.org({ status: 'draft' })
    const record = await report({
      title: `Detail ${fx.tag}`,
      responsibleOffices: [exec.id, hiddenOffice.id],
      summary: 'An abstract',
      related: [
        { relationTo: 'issuances', value: liveRelated.id },
        { relationTo: 'issuances', value: draftRelated.id },
      ],
      extra: { sourceVersionLabel: 'v1.0', organization: hiddenOrg.id },
    })
    const found = await readPublicRecord(payload, 'reports', record.slug)
    expect(found).toMatchObject({
      title: record.title,
      typeLabel: 'Financial report',
      sourceVersionLabel: 'v1.0',
      organization: null,
    })
    expect(found!.offices.map((o) => o.href)).toEqual([`/government/offices/${exec.slug}`])
    expect(found!.related).toEqual([
      { title: liveRelated.title, href: `/issuances/${liveRelated.slug}`, typeLabel: 'Issuance' },
    ])
    expect(found!.summary).not.toBeNull()
    expect(JSON.stringify(found)).not.toContain(draftRelated.title)
    expect(JSON.stringify(found)).not.toContain('lastTransition')
  })

  it('returns_null_for_draft_withdrawn_unknown_and_hostile_slugs', async () => {
    const draft = await issuance({ status: 'draft' })
    const withdrawn = await issuance({ status: 'draft' })
    await fx.version('issuances', withdrawn.id, { mainDocument: file })
    for (const slug of [
      draft.slug,
      withdrawn.slug,
      'nope',
      '',
      "' or 1=1 --",
      'a'.repeat(5000),
      '%00',
    ])
      expect(await readPublicRecord(payload, 'issuances', slug)).toBeNull()
  })

  it('does_not_show_an_issuance_slug_on_the_reports_collection', async () => {
    const i = await issuance()
    expect(await readPublicRecord(payload, 'reports', i.slug)).toBeNull()
  })

  it('lists_and_reads_published_activities_newest_first_and_hides_drafts', async () => {
    const y = await fx.year()
    const a = await fx.activity({
      organization: usg.id,
      academicYear: y.id,
      eventDate: ago(10),
      title: `Early ${fx.tag}`,
      location: 'Hall',
    })
    const b = await fx.activity({
      organization: usg.id,
      academicYear: y.id,
      eventDate: ago(1),
      title: `Late ${fx.tag}`,
      time: '9:00',
    })
    const d = await fx.activity({
      organization: usg.id,
      academicYear: y.id,
      eventDate: ago(3),
      title: `Hidden ${fx.tag}`,
      status: 'draft',
    })
    const list = await listActivities(payload, filters({ year: y.slug }), NOW)
    expect(titles(list.rows)).toEqual([b.title, a.title])
    expect(list.rows[0]!.href).toBe(`/activities/${b.slug}`)
    expect(JSON.stringify(list)).not.toContain(d.title)
    expect(await readPublicActivity(payload, d.slug)).toBeNull()
    expect(await readPublicActivity(payload, a.slug)).toMatchObject({
      title: a.title,
      location: 'Hall',
      organization: usg.name,
    })
  })

  const linkState = (...links: { relationTo: string; value: unknown; text: string }[]) => ({
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: links.map((l) => ({
            type: 'link',
            version: 3,
            direction: 'ltr',
            format: '',
            indent: 0,
            fields: {
              linkType: 'internal',
              newTab: false,
              doc: { relationTo: l.relationTo, value: l.value },
            },
            children: [
              {
                type: 'text',
                version: 1,
                text: l.text,
                format: 0,
                mode: 'normal',
                style: '',
                detail: 0,
              },
            ],
          })),
        },
      ],
    },
  })
  const html = (state: unknown) =>
    renderToStaticMarkup(React.createElement(RichText, { data: state as never }))

  it('renders_internal_rich_text_links_to_published_targets_and_plain_text_for_the_rest', async () => {
    const live = await fx.post({ title: `LiveLink ${fx.tag}` })
    const hidden = await fx.post({ title: `HiddenLink ${fx.tag}`, status: 'draft' })
    const liveIssuance = await issuance({ title: `LinkedIssuance ${fx.tag}` })
    const draftIssuance = await issuance({ title: `DraftIssuance ${fx.tag}`, status: 'draft' })
    const state = linkState(
      { relationTo: 'posts', value: live.id, text: 'live post' },
      { relationTo: 'posts', value: hidden.id, text: 'hidden post' },
      { relationTo: 'issuances', value: liveIssuance.id, text: 'live issuance' },
      { relationTo: 'issuances', value: draftIssuance.id, text: 'draft issuance' },
      { relationTo: 'posts', value: 999_999_999, text: 'missing post' },
      { relationTo: 'media', value: 1, text: 'unsupported' },
    )
    const rec = await issuance({ title: `Links ${fx.tag}`, richState: state })
    const found = await readPublicRecord(payload, 'issuances', rec.slug)
    const out = html(found!.summary)
    expect(out).toContain(`href="/posts/${live.slug}"`)
    expect(out).toContain(`href="/issuances/${liveIssuance.slug}"`)
    for (const text of ['hidden post', 'draft issuance', 'missing post', 'unsupported'])
      expect(out).toContain(text)
    for (const secret of [hidden.slug, draftIssuance.slug, hidden.title, draftIssuance.title])
      expect(out).not.toContain(secret)
    expect(out.match(/<a /g)).toHaveLength(2)
    const report = await fx.report({
      organization: usg.id,
      mainDocument: file,
      academicYear: year.id,
      richState: linkState({ relationTo: 'posts', value: hidden.id, text: 'gone' }),
    })
    expect(html((await readPublicRecord(payload, 'reports', report.slug))!.summary)).not.toContain(
      '<a ',
    )
    const act = await fx.activity({
      organization: usg.id,
      eventDate: ago(1),
      richState: linkState(
        { relationTo: 'posts', value: live.id, text: 'go' },
        { relationTo: 'posts', value: hidden.id, text: 'nope' },
      ),
    })
    const out2 = html((await readPublicActivity(payload, act.slug))!.description)
    expect(out2).toContain(`href="/posts/${live.slug}"`)
    expect(out2).not.toContain(hidden.slug)
  })

  it('clamps_an_over_range_activities_page_and_ignores_a_type_filter', async () => {
    const y = await fx.year()
    for (let i = 0; i < 14; i++)
      await fx.activity({ organization: usg.id, academicYear: y.id, eventDate: ago(i + 1) })
    const f = parseRecordFilters({ year: y.slug, page: '50', type: 'act' }, 'archives')
    const list = await listActivities(payload, { ...f, type: null }, NOW)
    expect([list.page, list.pageCount, list.rows.length]).toEqual([2, 2, 2])
  })
})
