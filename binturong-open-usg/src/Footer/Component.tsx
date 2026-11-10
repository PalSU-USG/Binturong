import { getCachedGlobal } from '@/utilities/getGlobals'
import React from 'react'

import { ThemeSelector } from '@/providers/Theme/ThemeSelector'
import { CMSLink } from '@/components/Link'
import { Wordmark } from '@/components/Wordmark'
import type { Footer as FooterType } from '@/payload-types'

async function readFooterLinks(): Promise<NonNullable<FooterType['navItems']>> {
  try {
    return (await getCachedGlobal('footer', 1)())?.navItems || []
  } catch (error) {
    console.error(
      'Footer links unavailable:',
      error instanceof Error ? error.message : 'unknown error',
    )
    return []
  }
}

export async function Footer() {
  const navItems = await readFooterLinks()

  return (
    <footer className="site-footer mt-auto border-t-4 border-accent-gold bg-brand-deep text-on-brand">
      <div className="container flex flex-col gap-8 py-8 md:flex-row md:justify-between">
        <Wordmark />
        <nav aria-label="Footer">
          {navItems.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-x-8 p-0 md:flex-row md:flex-wrap md:justify-end">
              {navItems.map(({ link }, i) => (
                <li key={i}>
                  <CMSLink
                    className="inline-flex min-h-11 items-center text-on-brand underline underline-offset-4"
                    {...link}
                  />
                </li>
              ))}
            </ul>
          )}
        </nav>
      </div>
      <div className="border-t border-on-brand/30">
        <div className="container flex flex-col gap-2 py-3 text-[length:var(--text-meta)] sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0">
            Public information, student services and institutional records of the University Student
            Government.
          </p>
          <ThemeSelector />
        </div>
      </div>
    </footer>
  )
}
