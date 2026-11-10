import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listOffices = vi.fn()
const readOffice = vi.fn()
const listParticipatingCsgs = vi.fn()
const readPublicActivity = vi.fn()
vi.mock('@/records/governmentQueries', () => ({
  listOffices: (...a: unknown[]) => listOffices(...a),
  readOffice: (...a: unknown[]) => readOffice(...a),
  listParticipatingCsgs: (...a: unknown[]) => listParticipatingCsgs(...a),
}))
vi.mock('@/records/recordQueries', () => ({
  readPublicActivity: (...a: unknown[]) => readPublicActivity(...a),
}))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: async () => ({}),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}))
vi.mock('@/components/RichText', () => ({ default: () => React.createElement('p', null, 'RICH') }))
vi.mock('@/components/SectionLayout', () => ({
  SectionLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}))
vi.mock('@/components/PayloadRedirects', () => ({
  PayloadRedirects: ({ url }: { url: string }) => {
    throw new Error(`NOT_FOUND ${url}`)
  },
}))

import { ActivityDetailPage } from '@/components/records/ActivityDetail'
import {
  OfficeDetailPage,
  OfficesDirectoryPage,
  OrganizationalChartPage,
  ParticipatingCsgsPage,
} from '@/components/records/GovernmentPages'

const html = async (element: Promise<React.ReactElement> | React.ReactElement) =>
  renderToStaticMarkup(await element)

describe('government and activity pages', () => {
  beforeEach(() => {
    for (const m of [listOffices, readOffice, listParticipatingCsgs, readPublicActivity])
      m.mockReset()
  })

  it('show_honest_empty_states', async () => {
    listOffices.mockResolvedValue([])
    listParticipatingCsgs.mockResolvedValue([])
    expect(await html(OrganizationalChartPage())).toContain('No offices have been published yet.')
    expect(await html(OfficesDirectoryPage())).toContain('No offices have been published yet.')
    expect(await html(ParticipatingCsgsPage())).toContain(
      'No participating CSGs have been published yet.',
    )
  })

  it('render_the_chart_with_branch_groups_and_nesting', async () => {
    listOffices.mockResolvedValue([
      { id: 1, name: 'President', slug: 'president', branch: 'executive', parent: null },
      { id: 2, name: 'Aide', slug: 'aide', branch: 'executive', parent: 1 },
    ])
    const out = await html(OrganizationalChartPage())
    expect(out).toContain('Executive')
    expect(out.indexOf('President')).toBeLessThan(out.indexOf('Aide'))
    expect(out).toContain('href="/government/offices/aide"')
  })

  it('link_each_participating_csg_to_its_records', async () => {
    listParticipatingCsgs.mockResolvedValue([{ name: 'CSG One', slug: 'csg-one' }])
    expect(await html(ParticipatingCsgsPage())).toContain(
      'href="/archives/participating-csgs?csg=csg-one"',
    )
  })

  it('show_office_holders_with_unrecorded_dates_and_no_contact_details', async () => {
    readOffice.mockResolvedValue({
      name: 'Office',
      slug: 'office',
      branch: 'executive',
      organization: 'USG',
      parent: null,
      children: [],
      holders: [
        {
          name: 'Cur',
          start: '2026-06-01T12:00:00.000Z',
          end: null,
          academicYear: 'AY',
          current: true,
        },
        { name: 'Unk', start: null, end: null, academicYear: null, current: false },
      ],
    })
    const out = await html(OfficeDetailPage({ params: Promise.resolve({ slug: 'office' }) }))
    expect(out).toContain('Cur</span> (current)')
    expect(out).toContain('From 1 June 2026')
    expect(out).toContain('Term dates not recorded')
    expect(out).not.toMatch(/mailto:|tel:|@/)
  })

  it('return_not_found_for_missing_offices_and_activities_without_echoing_the_slug', async () => {
    readOffice.mockResolvedValue(null)
    readPublicActivity.mockResolvedValue(null)
    await expect(
      html(OfficeDetailPage({ params: Promise.resolve({ slug: 'secret-draft' }) })),
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      html(OfficeDetailPage({ params: Promise.resolve({ slug: '%E0%A4%A' }) })),
    ).rejects.toThrow('NOT_FOUND')
    const error = await html(ActivityDetailPage({ params: Promise.resolve({ slug: 'x' }) })).catch(
      (e: Error) => e.message,
    )
    expect(error).toBe('NOT_FOUND /activities/x')
  })

  it('render_an_activity_and_omit_unset_fields', async () => {
    readPublicActivity.mockResolvedValue({
      id: 1,
      slug: 'a',
      title: 'Fair',
      eventDate: '2026-11-01T12:00:00.000Z',
      time: null,
      location: 'Hall',
      organization: null,
      academicYear: null,
      description: { root: {} },
      publishedAt: null,
      updatedAt: null,
    })
    const out = await html(ActivityDetailPage({ params: Promise.resolve({ slug: 'a' }) }))
    expect(out).toContain('1 November 2026')
    expect(out).toContain('Hall')
    for (const absent of ['Time', 'Organization', 'Academic year'])
      expect(out).not.toContain(`>${absent}</dt>`)
  })
})
