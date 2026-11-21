import { draftMode } from 'next/headers'
import React from 'react'

import type { Crumb } from '@/components/Breadcrumbs'
import { PageHeader, type Branch } from '@/components/PageHeader'
import { SectionIndex } from '@/components/SectionIndex'
import { findSection, resolveNavigation, type NavItem } from '@/Header/resolveNavigation'
import { getCachedGlobal } from '@/utilities/getGlobals'

/**
 * Adds orientation around content: the identity band (breadcrumb and the page's one h1) and the
 * section side nav. A failed or empty navigation read never blocks the content.
 */
export async function SectionLayout({
  section,
  fallback,
  trail,
  currentPath,
  currentLabel,
  title,
  eyebrow,
  intro,
  branch,
  children,
}: {
  section: NavItem['section']
  /** Section crumb used only when the Header has no usable row for this section. */
  fallback: Crumb
  /** Crumbs after the section, current item last. */
  trail: Crumb[]
  currentPath: string
  currentLabel?: string
  /** The page's only h1, shown in the identity band. */
  title: string
  eyebrow?: React.ReactNode
  intro?: React.ReactNode
  branch?: Branch
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
      <PageHeader
        crumbs={[
          { label: 'Home', href: '/' },
          found ? { label: found.label, href: found.href ?? fallback.href } : fallback,
          ...trail,
        ]}
        branch={branch}
        eyebrow={eyebrow}
        intro={intro}
        title={title}
      />
      <div className="container site-section-layout">
        {index}
        <div className="site-section-content">{children}</div>
      </div>
    </>
  )
}
