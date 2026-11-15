import type { Metadata } from 'next/types'

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'
import { PlainPage } from '@/components/PlainPage'
import { Search } from '@/search/Component'
import { SearchResults } from '@/search/SearchResults'
import { parseSearchParams } from '@/search/params'
import { runSearch } from '@/search/query'

type Args = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams: searchParamsPromise }: Args) {
  const { q, type, page } = parseSearchParams(await searchParamsPromise)
  const results =
    q === null
      ? null
      : await runSearch(await getPayload({ config: configPromise }), { q, type, page })

  return (
    <PlainPage
      crumbs={[{ label: 'Search' }]}
      intro="Search updates, issuances and reports by title, number or summary."
      title="Search"
    >      <div className="mb-8 max-w-[var(--measure)]">
        <Search q={q} type={type} />
      </div>

      {q === null || results === null ? (
        <p role="status">Enter at least two characters to search.</p>
      ) : (
        <SearchResults q={q} type={type} results={results} />
      )}
    </PlainPage>
  )
}

export function generateMetadata(): Metadata {
  return {
    title: 'Search | Binturong',
  }
}
