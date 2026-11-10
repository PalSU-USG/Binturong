import React from 'react'

import { issuanceTypes, type RecordFilters as Filters } from '@/records/recordFilters'
import type { YearOption } from '@/records/recordQueries'

const selectClass = 'min-h-11 rounded border border-foreground bg-background px-3'

/** Plain GET form: it works without scripts and never filters on the client. */
export function RecordFilters({
  action,
  filters,
  years,
  withType,
}: {
  action: string
  filters: Filters
  years: YearOption[]
  withType: boolean
}) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-4" method="get">
      <div className="flex flex-col gap-1">
        <label className="font-semibold" htmlFor="filter-year">
          Academic year
        </label>
        <select
          className={selectClass}
          defaultValue={filters.year ?? ''}
          id="filter-year"
          name="year"
        >
          <option value="">All years</option>
          {years.map((year) => (
            <option key={year.slug} value={year.slug}>
              {year.label}
            </option>
          ))}
        </select>
      </div>
      {withType && (
        <div className="flex flex-col gap-1">
          <label className="font-semibold" htmlFor="filter-type">
            Type
          </label>
          <select
            className={selectClass}
            defaultValue={filters.type ?? ''}
            id="filter-type"
            name="type"
          >
            <option value="">All types</option>
            {issuanceTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {filters.csg && <input name="csg" type="hidden" value={filters.csg} />}
      <button
        className="min-h-11 rounded border border-foreground px-4 font-semibold"
        type="submit"
      >
        Apply filters
      </button>
    </form>
  )
}
