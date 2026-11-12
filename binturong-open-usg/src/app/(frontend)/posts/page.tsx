import type { Metadata } from 'next/types'

import { UpdatesListing } from '@/components/UpdatesListing'
import React from 'react'
import PageClient from './page.client'
import { siteName } from '@/utilities/mergeOpenGraph'

export const dynamic = 'force-static'
export const revalidate = 600

export default function Page() {
  return (
    <>
      <PageClient />
      <UpdatesListing page={1} />
    </>
  )
}

export function generateMetadata(): Metadata {
  return {
    title: `Latest updates | ${siteName}`,
  }
}
