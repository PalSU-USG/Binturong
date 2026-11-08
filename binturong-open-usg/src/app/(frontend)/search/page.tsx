import type { Metadata } from 'next/types'

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'
import { Search } from '@/search/Component'
import { SearchResults } from '@/search/SearchResults'
import { parseSearchParams } from '@/search/params'
import { runSearch } from '@/search/query'
import PageClient from './page.client'

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
    <div className="pt-24 pb-24">
      <PageClient />
      <div className="container mb-16">
        <div className="prose dark:prose-invert max-w-none text-center">
          <h1 className="mb-8 lg:mb-16">Search</h1>

          <div className="max-w-[50rem] mx-auto">
            <Search q={q} type={type} />
          </div>
        </div>
      </div>

      {q === null || results === null ? (
        <div className="container" role="status">
          <p>Enter at least two characters to search published updates by title or summary.</p>
        </div>
      ) : (
        <SearchResults q={q} type={type} results={results} />
      )}
    </div>
  )
}

export function generateMetadata(): Metadata {
  return {
    title: 'Search | Binturong',
  }
}
