import Link from 'next/link'
import React from 'react'

import type { SearchType } from './params'
import type { SearchPage } from './query'

const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })

function pageHref(q: string, type: SearchType, page: number): string {
  const params = new URLSearchParams({ q })
  if (type !== 'all') params.set('type', type)
  if (page > 1) params.set('page', String(page))
  return `/search?${params.toString()}`
}

export const SearchResults: React.FC<{ q: string; type: SearchType; results: SearchPage }> = ({
  q,
  type,
  results,
}) => {
  const { hits, totalDocs, totalPages, page } = results

  if (hits.length === 0) {
    const pastEnd = totalDocs > 0 && page > totalPages
    return (
      <div className="container" role="status">
        {pastEnd ? (
          <p>
            That page has no results.{' '}
            <Link className="underline" href={pageHref(q, type, 1)}>
              Back to page 1
            </Link>
          </p>
        ) : (
          <>
            <p>No results for “{q}”.</p>
            <p>
              Try fewer words, or browse{' '}
              <Link className="underline" href="/posts">
                all updates
              </Link>
              .
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="container">
      <p className="mb-6" role="status">
        {totalDocs} {totalDocs === 1 ? 'result' : 'results'} for “{q}”
      </p>
      <ol className="flex flex-col gap-6">
        {hits.map((hit) => (
          <li key={hit.href} className="border-b border-border pb-6">
            <p className="text-sm text-muted-foreground">
              {hit.label}
              {hit.identifier ? ` · ${hit.identifier}` : ''}
              {hit.publishedAt ? ` · ${date.format(new Date(hit.publishedAt))}` : ''}
              {hit.recent ? ' · Recent' : ''}
            </p>
            <h2 className="text-xl font-semibold">
              <Link className="underline" href={hit.href}>
                {hit.title}
              </Link>
            </h2>
            {hit.summary && <p className="mt-2">{hit.summary}</p>}
          </li>
        ))}
      </ol>
      {totalPages > 1 && (
        <nav aria-label="Search pages" className="mt-8 flex items-center gap-6">
          {page > 1 ? (
            <Link className="underline" rel="prev" href={pageHref(q, type, page - 1)}>
              Previous
            </Link>
          ) : null}
          <span>
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link className="underline" rel="next" href={pageHref(q, type, page + 1)}>
              Next
            </Link>
          ) : null}
        </nav>
      )}
    </div>
  )
}
