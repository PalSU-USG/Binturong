import Link from 'next/link'
import React from 'react'

import { PlainPage } from '@/components/PlainPage'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <PlainPage crumbs={[{ label: 'Page not found' }]} title="Page not found">
      <p className="mb-6 max-w-[var(--measure)]">
        This page does not exist or has moved. Check the address, or use one of these.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button asChild>
          <Link href="/">Go to the home page</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/search">Search the site</Link>
        </Button>
      </div>
    </PlainPage>
  )
}