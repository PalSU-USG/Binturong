import type { Metadata } from 'next'

import { RecordListPage, type SearchParams } from '@/components/records/RecordListPage'

export const dynamic = 'force-dynamic'

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <RecordListPage
      basePath="/archives"
      fallback={{ label: 'Archives', href: '/archives' }}
      scope="archives"
      searchParams={searchParams}
      section="archives"
      title="Archives"
    />
  )
}

export const metadata: Metadata = { title: 'Archives | Binturong' }
