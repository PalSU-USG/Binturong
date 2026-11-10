import type { Metadata } from 'next'

import { RecordListPage, type SearchParams } from '@/components/records/RecordListPage'

export const dynamic = 'force-dynamic'

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <RecordListPage
      activities
      basePath="/activities"
      fallback={{ label: 'Activities', href: '/activities' }}
      scope="archives"
      searchParams={searchParams}
      section={null}
      title="Activities"
    />
  )
}

export const metadata: Metadata = { title: 'Activities | Binturong' }
