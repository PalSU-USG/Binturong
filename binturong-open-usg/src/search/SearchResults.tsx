import Link from 'next/link'
import React from 'react'

import { Pager } from '@/components/Pager'
import type { SearchType } from './params'
import type { SearchPage } from './query'

const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })

function pageHref(q: string, type: SearchType, page: number): string {
  const params = new URLSearchParams({ q })
  if (type !== 'all') params.set('type', type)
  if (page > 1) params.set('page', String(page))
  return `/search?${params.toString()}`
}

const linkClass = 'text-link underline underline-offset-4'

export const SearchResults: React.FC<{ q: string; type: SearchType; results: SearchPage }> = ({
  q,
  type,
  results,
}) => {
  const { hits, totalDocs, totalPages, page } = results

  if (hits.length === 0) {
    const pastEnd = totalDocs > 0 && page > totalPages
    return (
      <div role="status">
        {pastEnd ? (
          <p>
            That page has no results.{' '}
            <Link className={linkClass} href={pageHref(q, type, 1)}>
              Back to page 1
            </Link>
          </p>
        ) : (
          <>
            <p>No results for “{q}”.</p>
            <p>
              Try fewer words, or browse{' '}
              <Link className={linkClass} href="/posts">
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
    <div>
      <p className="mb-6" role="status">
        {totalDocs} {totalDocs === 1 ? 'result' : 'results'} for “{q}”
      </p>
      <ol className="site-destinations">
        {hits.map((hit) => (
          <li className="py-4" key={hit.href}>
            <p className="m-0 text-[length:var(--text-meta)] text-muted-foreground">
              {hit.label}
              {hit.identifier ? ` · ${hit.identifier}` : ''}
              {hit.publishedAt ? ` · ${date.format(new Date(hit.publishedAt))}` : ''}
              {hit.recent ? ' · Recent' : ''}
            </p>
            <h2 className="m-0 font-heading text-[length:var(--text-record-title)] font-semibold leading-snug">
              <Link
                className={`${linkClass} inline-flex min-h-[var(--target-hit)] items-center py-1 [overflow-wrap:anywhere]`}
                href={hit.href}
              >
                {hit.title}
              </Link>
            </h2>
            {hit.summary && <p className="mt-1 mb-0">{hit.summary}</p>}
          </li>
        ))}
      </ol>
      {totalPages > 1 && (
        <Pager
          label="Search pages"
          next={page < totalPages ? { href: pageHref(q, type, page + 1), text: 'Next' } : undefined}
          page={page}
          prev={page > 1 ? { href: pageHref(q, type, page - 1), text: 'Previous' } : undefined}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}
