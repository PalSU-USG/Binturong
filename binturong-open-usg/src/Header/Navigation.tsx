import Link from 'next/link'
import { draftMode } from 'next/headers'
import React from 'react'

import { getCachedGlobal } from '@/utilities/getGlobals'
import { PrimaryNavigation } from './PrimaryNavigation'
import { resolveNavigation } from './resolveNavigation'

export function MinimalNavigation({ unavailable = false }: { unavailable?: boolean }) {
  return (
    <nav aria-label="Primary" className="site-nav">
      <div className="site-nav-bar">
        <ul className="site-nav-list site-nav-minimal">
          <li className="site-nav-item">
            <Link className="site-nav-link" href="/">
              Home
            </Link>
          </li>
        </ul>
        <Link className="site-nav-link site-nav-search" href="/search">
          Search
        </Link>
      </div>
      {unavailable && (
        <p className="site-nav-notice">
          Navigation is unavailable right now. Home and Search still work.
        </p>
      )}
    </nav>
  )
}

/** Empty configuration and failed reads are different states; neither falls back to draft data. */
export async function HeaderNavigation() {
  // Staff preview shows unavailable destinations as text; read outside the try so Next's
  // dynamic-rendering signals are never swallowed.
  const { isEnabled: review } = await draftMode()
  let items: ReturnType<typeof resolveNavigation>
  try {
    items = resolveNavigation(await getCachedGlobal('header', 1)(), { review })
  } catch (error) {
    console.error(
      'Header navigation unavailable:',
      error instanceof Error ? error.message : 'unknown error',
    )
    return <MinimalNavigation unavailable />
  }
  return items.length ? <PrimaryNavigation items={items} /> : <MinimalNavigation />
}
