import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listRecords = vi.fn()
const listActivities = vi.fn()
const listAcademicYears = vi.fn()
vi.mock('@/records/recordQueries', () => ({
  listRecords: (...a: unknown[]) => listRecords(...a),
  listActivities: (...a: unknown[]) => listActivities(...a),
  listAcademicYears: (...a: unknown[]) => listAcademicYears(...a),
}))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: async () => ({}),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('@/components/SectionLayout', () => ({
  SectionLayout: ({
    children,
    title,
    trail,
  }: {
    children: React.ReactNode
    title: string
    trail: { label: string }[]
  }) =>
    React.createElement(
      'div',
      { 'data-trail': trail.map((t) => t.label).join('>') },
      React.createElement('h1', null, title),
      children,
    ),
}))

import { RecordListPage } from '@/components/records/RecordListPage'
import { TransparencyOverview } from '@/components/records/TransparencyOverview'
import type { RecordRowData } from '@/records/recordQueries'

const row = (over: Partial<RecordRowData> = {}): RecordRowData => ({
  key: 'issuances-1',
  collection: 'issuances',
  id: 1,
  typeLabel: 'Memorandum',
  identifier: 'Memo No. 17',
  title: 'A <i>title</i>',
  href: '/issuances/memo-17',
  sourceDate: '2026-10-12T00:00:00.000Z',
  sourceDateLabel: 'Issued',
  publishedAt: '2026-10-12T00:00:00.000Z',
  recent: true,
  organization: 'Synthetic org',
  location: null,
  time: null,
  fileHref: '/api/documents/9/file',
  ...over,
})
const list = (over = {}) => ({
  rows: [row()],
  total: 1,
  page: 1,
  pageCount: 1,
  notices: [],
  ...over,
})
const page = async (searchParams: Record<string, string> = {}, props: object = {}) =>
  renderToStaticMarkup(
    await RecordListPage({
      scope: 'archives',
      title: 'Archives',
      basePath: '/archives',
      section: 'archives',
      fallback: { label: 'Archives', href: '/archives' },
      searchParams: Promise.resolve(searchParams),
      ...props,
    }),
  )

describe('record list pages', () => {
  beforeEach(() => {
    listRecords.mockReset()
    listActivities.mockReset()
    listAcademicYears.mockReset()
    listAcademicYears.mockResolvedValue([{ slug: 'sy-1', label: 'SY 2026-2027' }])
  })

  it('renders_rows_filters_and_a_recent_label_with_canonical_links', async () => {
    listRecords.mockResolvedValue(list())
    const out = await page({ year: 'sy-1' })
    expect(out).toContain('action="/archives"')
    expect(out).toContain('method="get"')
    expect(out).toMatch(/<option value="sy-1" selected/)
    expect(out).toContain('Recent')
    expect(out).toContain('href="/issuances/memo-17"')
    expect(out).toContain('href="/api/documents/9/file"')
    expect(out).toContain('&lt;i&gt;title&lt;/i&gt;')
    expect(out).toContain('12 October 2026</time>')
    expect(out).toContain('data-trail=""')
    expect(out).toContain('<ol')
  })

  it('omits_the_pdf_link_when_the_file_is_not_ready_and_the_recent_label_when_not_due', async () => {
    listRecords.mockResolvedValue(list({ rows: [row({ fileHref: null, recent: false })] }))
    const out = await page()
    expect(out).not.toContain('Download PDF')
    expect(out).not.toContain('Recent')
    expect(out).toContain('View record')
  })

  it('shows_an_empty_state_with_clear_filters_only_when_filtered', async () => {
    listRecords.mockResolvedValue(list({ rows: [], total: 0, pageCount: 0 }))
    const filtered = await page({ year: 'sy-1' })
    expect(filtered).toContain('No published records match these filters.')
    expect(filtered).toContain('Clear filters')
    expect(await page()).not.toContain('Clear filters')
  })

  it('shows_notices_and_keeps_filters_in_pagination_links', async () => {
    listRecords.mockResolvedValue(
      list({
        page: 2,
        pageCount: 3,
        total: 30,
        notices: ['Academic year not found; showing all years.'],
      }),
    )
    const out = await page({ type: 'act', page: '2' })
    expect(out).toContain('Academic year not found')
    expect(out).toContain('href="/archives?type=act"')
    expect(out).toContain('href="/archives?type=act&amp;page=3"')
  })

  it('hides_next_at_the_browsing_depth_limit', async () => {
    listRecords.mockResolvedValue(list({ page: 50, pageCount: 60, total: 700 }))
    const out = await page({ page: '50' })
    expect(out).toContain('Previous page')
    expect(out).not.toContain('Next page')
  })

  it('ignores_the_type_parameter_on_activities', async () => {
    listActivities.mockResolvedValue(list())
    const out = await page({ type: 'act' }, { activities: true })
    expect(listActivities.mock.calls[0]![1]).toMatchObject({ type: null })
    expect(out).not.toContain('id="filter-type"')
    expect(out).not.toContain('not recognised')
  })
  it('propagates_a_failed_read_so_the_error_boundary_renders_instead_of_an_empty_list', async () => {
    listRecords.mockRejectedValue(new Error('Synthetic outage'))
    await expect(page()).rejects.toThrow('Synthetic outage')
  })

  it('transparency_overview_lists_both_report_kinds_and_has_honest_empty_states', async () => {
    listRecords.mockImplementation(async (_p: unknown, scope: string) =>
      scope === 'financial' ? list() : list({ rows: [], total: 0, pageCount: 0 }),
    )
    const out = renderToStaticMarkup(await TransparencyOverview())
    expect(out).toContain('Financial reports')
    expect(out).toContain('View all financial reports (1)')
    expect(out).toContain('No accomplishment reports have been published yet.')
    expect(out).not.toContain('Introduction')
  })
})
