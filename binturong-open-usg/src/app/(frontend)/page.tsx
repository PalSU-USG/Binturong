import type { Metadata } from 'next'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

import { HomePage } from '@/components/home/HomePage'
import { getHomeData } from '@/home/getHomeData'
import { siteDescription, siteName } from '@/utilities/mergeOpenGraph'

// Per request: the notice window and "upcoming" depend on the clock, so a cached page would go
// stale with no publish event to revalidate it, and a withdrawn record must disappear at once.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const payload = await getPayload({ config: configPromise })
  return <HomePage data={await getHomeData(payload)} />
}

export const metadata: Metadata = {
  title: { absolute: siteName },
  description: siteDescription,
}
