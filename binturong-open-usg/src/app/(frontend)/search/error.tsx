'use client'

import React from 'react'

import { Button } from '@/components/ui/button'

export default function SearchError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container py-28" role="alert">
      <h1 className="mb-4 text-3xl font-semibold">Search is unavailable</h1>
      <p className="mb-6">The search could not be completed. Try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
