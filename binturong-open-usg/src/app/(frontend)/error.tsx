'use client'

import { useRouter } from 'next/navigation'
import React, { startTransition } from 'react'

import { Button } from '@/components/ui/button'

/** Root route boundary. A failed read is never presented as an empty page. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter()
  return (
    <div className="container py-16" role="alert">
      <h1 className="mb-4 text-3xl font-semibold">This page could not be loaded</h1>
      <p className="mb-6">Something went wrong while loading this page. Try again in a moment.</p>
      <Button
        onClick={() => {
          // Re-render the server component, then clear the boundary so the new render shows.
          startTransition(() => {
            router.refresh()
            reset()
          })
        }}
      >
        Try again
      </Button>
    </div>
  )
}
