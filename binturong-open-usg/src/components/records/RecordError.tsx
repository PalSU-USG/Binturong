'use client'

import React from 'react'

import { PlainPage } from '@/components/PlainPage'
import { Button } from '@/components/ui/button'

/** Shared route error boundary: a failed read is never presented as an empty page. */
export function RecordError({
  reset,
  message = 'Something went wrong while loading the records. Try again in a moment.',
}: {
  reset: () => void
  message?: string
}) {
  return (
    <PlainPage crumbs={[{ label: 'Error' }]} role="alert" title="This page could not be loaded">
      <p className="mb-6 max-w-[var(--measure)]">{message}</p>
      <Button onClick={reset}>Try again</Button>
    </PlainPage>
  )
}