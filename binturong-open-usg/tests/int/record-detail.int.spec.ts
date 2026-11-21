import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const readPublicRecord = vi.fn()
const readPublicFileFacts = vi.fn()
vi.mock('@/records/recordQueries', () => ({
  readPublicRecord: (...a: unknown[]) => readPublicRecord(...a),
}))
vi.mock('@/records/publicFileFacts', () => ({
  readPublicFileFacts: (...a: unknown[]) => readPublicFileFacts(...a),
}))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: async () => ({}),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}))
vi.mock('@/components/RichText', () => ({
  default: () => React.createElement('div', null, 'RICH-SUMMARY'),
}))
vi.mock('@/components/SectionLayout', () => ({
  SectionLayout: ({
    children,
    eyebrow,
    intro,
    title,
    trail,
  }: {
    children: React.ReactNode
    eyebrow?: string
    intro?: string
    title: string
    trail: { label: string }[]
  }) =>
    React.createElement(
      'div',
      { 'data-trail': trail.map((t) => t.label).join('>') },
      React.createElement('p', null, eyebrow),
      React.createElement('p', null, intro),
      React.createElement('h1', null, title),
      children,
    ),
}))
vi.mock('@/components/PayloadRedirects', () => ({
  PayloadRedirects: ({ url }: { url: string }) => {
    throw new Error(`NOT_FOUND ${url}`)
  },
}))

import { RecordDetail } from '@/components/records/RecordDetail'
import { RecordDetailPage } from '@/components/records/RecordDetailPage'
import type { PublicFileFacts } from '@/records/publicFileFacts'
import type { PublicRecord } from '@/records/recordQueries'

const record = (over: Partial<PublicRecord> = {}): PublicRecord => ({
  collection: 'issuances',
  id: 1,
  slug: 'eo-1',
  title: 'Title <b>x</b>',
  typeLabel: 'Executive order',
  identifier: 'EO No. 1',
  publishedAt: '2026-10-18T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
  issuedDate: null,
  effectiveDate: null,
  reportingPeriod: null,
  periodStartDate: null,
  periodEndDate: null,
  sourceVersionLabel: null,
  summary: { root: {} } as never,
  organization: null,
  offices: [],
  academicYear: null,
  related: [],
  ...over,
})
const facts = (over: Partial<PublicFileFacts> = {}): PublicFileFacts => ({
  main: { id: 7, filename: 'eo-1.pdf', size: 1_887_437, sha256: 'a'.repeat(64) },
  attachments: [{ id: 8, filename: 'annex.pdf', size: 500, sha256: 'b'.repeat(64) }],
  versions: [
    { number: 1, size: 100, date: '2026-01-05T00:00:00.000Z', current: false },
    { number: 2, size: 1_887_437, date: '2026-10-18T00:00:00.000Z', current: true },
  ],
  ...over,
})
const html = (r: PublicRecord, f: PublicFileFacts | null) =>
  renderToStaticMarkup(React.createElement(RecordDetail, { record: r, facts: f }))

describe('record detail', () => {
  it('renders_regions_in_order_with_one_controlled_pdf_action', () => {
    const out = html(
      record({ related: [{ title: 'Memo', href: '/issuances/memo', typeLabel: 'Issuance' }] }),
      facts(),
    )
    const order = [
      'Published',
      'Download PDF (1.8 MB)',
      'Summary',
      'Document information',
      'Version history',
      'Related records',
    ]
    const positions = order.map((s) => out.indexOf(s))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(out.match(/Download PDF/g)).toHaveLength(1)
    // The page's one h1 lives in the identity band (SectionLayout), not in the record body.
    expect(out).not.toContain('<h1')
    expect(out).toContain('href="/api/documents/7/file"')
    expect(out).toContain('href="/api/documents/8/file"')
    expect(out).toContain('Version 2 (current)')
    expect(out).not.toMatch(/storageKey|ready\//)
  })

  it('omits_unset_fields_instead_of_showing_placeholders', () => {
    const out = html(
      record({ summary: null, publishedAt: null, updatedAt: null }),
      facts({ attachments: [], versions: [] }),
    )
    for (const text of [
      'N/A',
      'Effective',
      'Issued',
      'Academic year',
      'Organization',
      'Summary',
      'Version history',
      'Related records',
      'Published',
    ])
      expect(out).not.toContain(text)
  })

  it('says_the_file_is_unavailable_instead_of_linking_when_facts_are_missing', () => {
    const out = html(record(), null)
    expect(out).toContain('temporarily unavailable')
    expect(out).not.toContain('/api/documents/')
    expect(html(record(), facts({ main: null, attachments: [], versions: [] }))).not.toContain(
      '/api/documents/',
    )
  })
})

describe('record detail route', () => {
  beforeEach(() => {
    readPublicRecord.mockReset()
    readPublicFileFacts.mockReset()
  })

  it('treats_a_missing_record_as_not_found_without_reading_files', async () => {
    readPublicRecord.mockResolvedValue(null)
    const outcome = await Promise.resolve()
      .then(async () =>
        renderToStaticMarkup(
          await RecordDetailPage({
            collection: 'issuances',
            params: Promise.resolve({ slug: 'draft-one' }),
          }),
        ),
      )
      .catch((e: Error) => e.message)

    expect(outcome).toBe('NOT_FOUND /issuances/draft-one')
    expect(readPublicFileFacts).not.toHaveBeenCalled()
  })

  it('logs_and_shows_unavailable_when_file_facts_fail', async () => {
    readPublicRecord.mockResolvedValue(record())
    readPublicFileFacts.mockRejectedValue(new Error('Synthetic outage'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const out = renderToStaticMarkup(
      await RecordDetailPage({
        collection: 'issuances',
        params: Promise.resolve({ slug: 'eo-1' }),
      }),
    )
    expect(out).toContain('temporarily unavailable')
    expect(out).not.toContain('/api/documents/')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('shows_the_citation_under_the_issuance_title_only_when_number_and_year_exist', async () => {
    readPublicFileFacts.mockResolvedValue(facts())
    const render = async (over: Partial<PublicRecord>) => {
      readPublicRecord.mockResolvedValue(record({ typeLabel: 'Memorandum', ...over }))
      return renderToStaticMarkup(
        await RecordDetailPage({ collection: 'issuances', params: Promise.resolve({ slug: 'm' }) }),
      )
    }
    const full = await render({ identifier: '023', academicYear: '2026-2027' })
    expect(full).toContain('Memorandum No. 023, s. 2026-2027')
    expect(full).toContain('tabular-nums')
    const noNumber = await render({ identifier: null, academicYear: '2026-2027' })
    expect(noNumber).not.toContain('No. ')
    // Without a published academic year there is no series, so only the number shows.
    const noYear = await render({ identifier: '023', academicYear: null })
    expect(noYear).not.toContain('No. 023')
    expect(noYear).toContain('<p>023</p>')
  })

  it('uses_the_matching_section_trail_for_reports', async () => {
    readPublicRecord.mockResolvedValue(
      record({ collection: 'reports', typeLabel: 'Financial report' }),
    )
    readPublicFileFacts.mockResolvedValue(facts())
    const out = renderToStaticMarkup(
      await RecordDetailPage({ collection: 'reports', params: Promise.resolve({ slug: 'r' }) }),
    )
    expect(out).toContain('<h1>Title &lt;b&gt;x&lt;/b&gt;</h1>')
    expect(out).toContain('data-trail="Financial reports&gt;Title')
  })
})
