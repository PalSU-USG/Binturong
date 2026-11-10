import Link from 'next/link'
import React from 'react'

import type { RecordRowData } from '@/records/recordQueries'
import { formatLongDate } from './format'

export function RecordRow({ row, headingLevel = 2 }: { row: RecordRowData; headingLevel?: 2 | 3 }) {
  const Heading = `h${headingLevel}` as const
  const date = formatLongDate(row.sourceDate)
  const meta = [row.organization, row.location, row.time].filter(Boolean)
  return (
    <li className="border-b border-border py-6">
      <p className="text-sm font-semibold uppercase tracking-wide">
        {row.typeLabel}
        {row.recent && (
          <span className="ml-2 rounded border border-foreground px-2 py-0.5 normal-case">
            Recent
          </span>
        )}
      </p>
      {row.identifier && <p className="[overflow-wrap:anywhere]">{row.identifier}</p>}
      <Heading className="mt-1 text-xl font-semibold [overflow-wrap:anywhere]">
        <Link className="underline" href={row.href}>
          {row.title}
        </Link>
      </Heading>
      {(date || meta.length > 0) && (
        <p className="mt-1 text-sm text-muted-foreground">
          {date && (
            <>
              {row.sourceDateLabel}: <time dateTime={String(row.sourceDate)}>{date}</time>
            </>
          )}
          {date && meta.length > 0 && ' · '}
          {meta.join(' · ')}
        </p>
      )}
      <p className="mt-2 flex flex-wrap gap-x-6">
        <Link className="inline-flex min-h-11 items-center underline" href={row.href}>
          View record
          <span className="sr-only">: {row.title}</span>
        </Link>
        {row.fileHref && (
          <a className="inline-flex min-h-11 items-center underline" download href={row.fileHref}>
            Download PDF
            <span className="sr-only">: {row.title}</span>
          </a>
        )}
      </p>
    </li>
  )
}
