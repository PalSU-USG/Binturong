'use client'

import { useRouter } from 'next/navigation'
import React, { startTransition } from 'react'

import { RecordError } from '@/components/records/RecordError'

/** Root route boundary. A failed read is never presented as an empty page. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter()
  return (
    <RecordError
      message="Something went wrong while loading this page. Try again in a moment."
      reset={() => {
        // Re-render the server component, then clear the boundary so the new render shows.
        startTransition(() => {
          router.refresh()
          reset()
        })
      }}
    />
  )
}