import Link from 'next/link'
import React from 'react'

import { MAX_PAGE, type RecordFilters } from '@/records/recordFilters'
import type { RecordList as RecordListData } from '@/records/recordQueries'
import { RecordRow } from './RecordRow'

export function listHref(basePath: string, filters: Partial<RecordFilters>, page = 1): string {
  const params = new URLSearchParams()
  if (filters.year) params.set('year', filters.year)
  if (filters.type) params.set('type', filters.type)
  if (filters.csg) params.set('csg', filters.csg)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

export function RecordList({
  list,
  basePath,
  filters,
  emptyText = 'No published records match these filters.',
}: {
  list: RecordListData
  basePath: string
  filters: RecordFilters
  emptyText?: string
}) {
  const filtered = Boolean(filters.year || filters.type || filters.csg)
  if (list.rows.length === 0)
    return (
      <div role="status">
        <p>{emptyText}</p>
        {filtered && (
          <p>
            <Link className="inline-flex min-h-11 items-center underline" href={basePath}>
              Clear filters
            </Link>
          </p>
        )}
      </div>
    )
  const { page, pageCount } = list
  return (
    <>
      <p role="status">
        {list.total} {list.total === 1 ? 'record' : 'records'}
        {pageCount > 1 ? `, page ${page} of ${pageCount}` : ''}
      </p>
      <ol className="mt-2">
        {list.rows.map((row) => (
          <RecordRow key={row.key} row={row} />
        ))}
      </ol>
      {pageCount > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link
              className="inline-flex min-h-11 items-center underline"
              href={listHref(basePath, filters, page - 1)}
              rel="prev"
            >
              Previous page
            </Link>
          ) : (
            <span />
          )}
          {page < pageCount && page < MAX_PAGE ? (
            <Link
              className="inline-flex min-h-11 items-center underline"
              href={listHref(basePath, filters, page + 1)}
              rel="next"
            >
              Next page
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  )
}
