import type { Metadata } from 'next'

import { RecordDetailPage, recordMetadata } from '@/components/records/RecordDetailPage'

export const dynamic = 'force-dynamic'

type Args = { params: Promise<{ slug?: string }> }

export default function Page({ params }: Args) {
  return <RecordDetailPage collection="reports" params={params} />
}

export function generateMetadata({ params }: Args): Promise<Metadata> {
  return recordMetadata('reports', params)
}
