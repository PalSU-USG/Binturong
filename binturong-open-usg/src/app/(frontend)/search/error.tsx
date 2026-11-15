'use client'

import React from 'react'

import { Button } from '@/components/ui/button'
import { PlainPage } from '@/components/PlainPage'

export default function SearchError({ reset }: { error: Error; reset: () => void }) {
  return (
    <PlainPage crumbs={[{ label: 'Search', href: '/search' }, { label: 'Error' }]} role="alert" title="Search is unavailable">
      <p className="mb-6">The search could not be completed. Try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
    </PlainPage>
  )
}
