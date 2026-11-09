import { draftMode } from 'next/headers'
import React from 'react'

import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { SectionIndex } from '@/components/SectionIndex'
import { findSection, resolveNavigation, type NavItem } from '@/Header/resolveNavigation'
import { getCachedGlobal } from '@/utilities/getGlobals'

/** Adds orientation around content. A failed or empty navigation read never blocks the content. */
export async function SectionLayout({
  section,
  fallback,
  trail,
  currentPath,
  currentLabel,
  children,
}: {
  section: NavItem['section']
  /** Section crumb used only when the Header has no usable row for this section. */
  fallback: Crumb
  /** Crumbs after the section, current item last. */
  trail: Crumb[]
  currentPath: string
  currentLabel?: string
  children: React.ReactNode
}) {
  const { isEnabled: review } = await draftMode()
  let found: NavItem | null = null
  try {
    found = findSection(
      resolveNavigation(await getCachedGlobal('header', 1)(), { review }),
      section,
    )
  } catch (error) {
    console.error(
      'Section index unavailable:',
      error instanceof Error ? error.message : 'unknown error',
    )
  }
  const index = found && (
    <SectionIndex
      currentLabel={currentLabel}
      currentPath={currentPath}
      review={review}
      section={found}
    />
  )
  return (
    <>
      <div className="container">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            found ? { label: found.label, href: found.href ?? undefined } : fallback,
            ...trail,
          ]}
        />
      </div>
      <div className={index ? 'container site-section-layout' : undefined}>
        {index}
        <div className="site-section-content">{children}</div>
      </div>
    </>
  )
}
