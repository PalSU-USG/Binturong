import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

import { SectionLayout } from '@/components/SectionLayout'
import { parseRecordFilters, type RecordScope } from '@/records/recordFilters'
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
  title: string
  intro?: string
  basePath: string
  section: NavItem['section']
  fallback: { label: string; href: string }
  trail?: { label: string; href?: string }[]
  searchParams: Promise<SearchParams>
}) {
  const { type: _ignored, ...params } = await searchParams
  // Activities have no record types, so a type parameter is ignored.
  const filters = parseRecordFilters(activities ? params : { ...params, type: _ignored }, scope)
  const payload = await getPayload({ config: configPromise })
  const [list, years] = await Promise.all([
    activities ? listActivities(payload, filters) : listRecords(payload, scope, filters),
    listAcademicYears(payload) as Promise<YearOption[]>,
  ])
  const withType = !activities && scope !== 'financial' && scope !== 'accomplishment'
  return (
    <SectionLayout
      currentLabel={title}
      currentPath={basePath}
      fallback={{ label: fallback.label }}
      section={section}
      trail={title === fallback.label ? [] : [...trail, { label: title }]}
    >
      <div className="container pt-8 pb-16">
        <h1 className="text-3xl font-semibold">{title}</h1>
        {intro && <p className="mt-2 max-w-[48rem]">{intro}</p>}
        <div className="mt-6">
          <RecordFilters action={basePath} filters={filters} withType={withType} years={years} />
        </div>
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
