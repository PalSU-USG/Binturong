import type { Metadata } from 'next'

import { ActivityDetailPage, activityMetadata } from '@/components/records/ActivityDetail'

export const dynamic = 'force-dynamic'

type Args = { params: Promise<{ slug?: string }> }

export default function Page({ params }: Args) {
  return <ActivityDetailPage params={params} />
}

export function generateMetadata({ params }: Args): Promise<Metadata> {
  return activityMetadata(params)
}
