import React from 'react'

export function RecordLoading() {
  return (
    <div aria-busy="true" className="container py-16" role="status">
      <p>Loading records…</p>
      <div aria-hidden className="mt-4 min-h-[24rem]" />
    </div>
  )
}
