import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

import { SectionLayout } from '@/components/SectionLayout'
import { issuanceTypes, parseRecordFilters, type RecordScope } from '@/records/recordFilters'
import {
  listAcademicYears,
  listActivities,
  listRecords,
  type YearOption,
} from '@/records/recordQueries'
import type { NavItem } from '@/Header/resolveNavigation'
import { RecordFilters } from './RecordFilters'
import { RecordList } from './RecordList'

export type SearchParams = Record<string, string | string[] | undefined>

/**
 * One server-rendered query view. A failed read throws to the route's error boundary; it is never
 * rendered as an empty list. Rendered per request, so a withdrawn record disappears immediately.
 */
export async function RecordListPage({
  scope,
  activities = false,
  fixedType,
  title,
  intro,
  basePath,
  section,
  fallback,
  trail = [],
  searchParams,
}: {
  scope: RecordScope
  activities?: boolean
  /** Issuance type the page always lists; the URL cannot change it. */
  fixedType?: (typeof issuanceTypes)[number]['value']
  title: string
  intro?: string
  basePath: string
  section: NavItem['section']
  fallback: { label: string; href: string }
  trail?: { label: string; href?: string }[]
  searchParams: Promise<SearchParams>
}) {
  const { type: _ignored, ...params } = await searchParams
  // Activities have no record types and fixed-type pages set their own, so a type parameter is
  // ignored. The fixed type goes to the query only, so links and "Clear filters" leave it out.
  const filters = parseRecordFilters(
    activities || fixedType ? params : { ...params, type: _ignored },
    scope,
  )
  const payload = await getPayload({ config: configPromise })
  const [list, years] = await Promise.all([
    activities
      ? listActivities(payload, filters)
      : listRecords(payload, scope, fixedType ? { ...filters, type: fixedType } : filters),
    listAcademicYears(payload) as Promise<YearOption[]>,
  ])
  const withType = !activities && !fixedType && scope !== 'financial' && scope !== 'accomplishment'
  return (
    <SectionLayout
      branch={scope === 'legislative' || scope === 'judicial' ? scope : undefined}
      currentLabel={title}
      currentPath={basePath}
      fallback={fixedType ? fallback : { label: fallback.label }}
      intro={intro}
      section={section}
      title={title}
      trail={title === fallback.label ? [] : [...trail, { label: title }]}
    >
      <div className="pt-6 pb-16">
        <RecordFilters action={basePath} filters={filters} withType={withType} years={years} />
        {list.notices.length > 0 && (
          <ul className="mt-4" role="status">
            {list.notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        )}
        <div className="mt-6">
          <RecordList basePath={basePath} filters={filters} list={list} />
        </div>
      </div>
    </SectionLayout>
  )
}
