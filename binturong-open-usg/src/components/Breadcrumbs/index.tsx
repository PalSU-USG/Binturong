import Link from 'next/link'
import React from 'react'

import { safeUrl } from '@/utilities/safeUrl'

export type Crumb = { label: string; href?: string }

/**
 * Receives explicit ancestry from the route or content owner, current item last. Ancestors
 * without a usable label or destination are omitted rather than guessed.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const last = items.length - 1
  const crumbs = items.flatMap((item, index) => {
    const label = item.label.trim()
    const href = safeUrl(item.href)
    return label && (index === last || href) ? [{ label, href, current: index === last }] : []
  })
  if (!crumbs.length) return null
  return (
    <nav aria-label="Breadcrumb" className="site-breadcrumbs">
      <ol>
        {crumbs.map(({ label, href, current }) => (
          <li key={`${label}-${href ?? 'current'}`}>
            {current || !href ? (
              <span aria-current={current ? 'page' : undefined}>{label}</span>
            ) : (
              <Link href={href}>{label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
