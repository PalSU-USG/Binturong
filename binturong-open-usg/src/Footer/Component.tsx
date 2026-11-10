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
    <footer className="mt-auto border-t border-border bg-black dark:bg-card text-white">
      <div className="container py-8 gap-8 flex flex-col md:flex-row md:justify-between">
        <Wordmark className="text-white" />

        <div className="flex flex-col-reverse items-start md:flex-row gap-4 md:items-center">
          <ThemeSelector />
          <nav aria-label="Footer" className="flex flex-col md:flex-row gap-4">
            {navItems.map(({ link }, i) => {
              return <CMSLink className="text-white" key={i} {...link} />
            })}
          </nav>
        </div>
      </div>
    </footer>
  )
}
