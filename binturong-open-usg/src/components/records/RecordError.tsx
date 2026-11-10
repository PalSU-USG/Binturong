'use client'

import React from 'react'

import { Button } from '@/components/ui/button'

/** Shared route error boundary: a failed read is never presented as an empty page. */
export function RecordError({ reset }: { reset: () => void }) {
  return (
    <div className="container py-16" role="alert">
      <h1 className="mb-4 text-3xl font-semibold">This page could not be loaded</h1>
      <p className="mb-6">Something went wrong while loading the records. Try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
