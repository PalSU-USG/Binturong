import Link from 'next/link'
import React from 'react'

import { matchPath } from '@/Header/currentPath'
import type { NavItem } from '@/Header/resolveNavigation'

/** Reuses the resolved Header group; there is no second CMS copy of the menu. */
export function SectionIndex({
  section,
  currentPath,
  currentLabel,
  review = false,
}: {
  section: NavItem
  currentPath: string
  currentLabel?: string
  review?: boolean
}) {
  const children = section.children.filter((child) => child.available || review)
  if (!children.length) return null
  const exact = children.some((child) => matchPath(child.href, currentPath) === 'page')
  return (
    <nav aria-label={`${section.label} section`} className="site-section-index">
      <p className="site-section-index-title">On this section</p>
      <ul>
        {children.map((child) => (
          <li key={child.id}>
            {child.href ? (
              <Link
                aria-current={matchPath(child.href, currentPath) === 'page' ? 'page' : undefined}
                href={child.href}
                {...(child.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {child.label}
              </Link>
            ) : (
              <span>
                {child.label} <span className="site-nav-note">Not yet available</span>
              </span>
            )}
          </li>
        ))}
        {!exact && currentLabel && (
          <li>
            <span aria-current="page">{currentLabel}</span>
          </li>
        )}
      </ul>
    </nav>
  )
}
