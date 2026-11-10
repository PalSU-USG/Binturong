import type { Metadata } from 'next'

import { TransparencyOverview } from '@/components/records/TransparencyOverview'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <TransparencyOverview />
}

export const metadata: Metadata = { title: 'Transparency | Binturong' }
