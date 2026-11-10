'use client'

import { RecordError } from '@/components/records/RecordError'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <RecordError reset={reset} />
}
