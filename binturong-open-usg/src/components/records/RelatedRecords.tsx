import Link from 'next/link'
import React from 'react'

import type { RelatedRecord } from '@/records/recordQueries'

export function RelatedRecords({ items }: { items: RelatedRecord[] }) {
  if (!items.length) return null
  return (
    <section aria-labelledby="related-heading" className="mt-10">
      <h2 className="text-xl font-semibold" id="related-heading">
        Related records
      </h2>
      <ul className="mt-3 flex flex-col">
        {items.map((item) => (
          <li key={item.href}>
            <Link className="inline-flex min-h-[var(--target-hit)] items-center underline" href={item.href}>
              {item.title}
            </Link>{' '}
            <span className="text-sm text-muted-foreground">({item.typeLabel})</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
