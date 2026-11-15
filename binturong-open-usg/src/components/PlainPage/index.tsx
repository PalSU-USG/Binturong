import React from 'react'

import type { Crumb } from '@/components/Breadcrumbs'
import { PageHeader } from '@/components/PageHeader'

/**
 * Identity band plus a content area for pages that have no section navigation: search, 404,
 * error boundaries and CMS pages. Gives them the same band, gold rule and spacing as
 * SectionLayout pages, with the page's one h1 inside the band.
 */
export function PlainPage({
  title,
  crumbs,
  intro,
  role,
  children,
}: {
  title: string
  crumbs: Crumb[]
  intro?: React.ReactNode
  /** `alert` for error boundaries. */
  role?: 'alert'
  children?: React.ReactNode
}) {
  return (
    <div role={role}>
      <PageHeader crumbs={[{ label: 'Home', href: '/' }, ...crumbs]} intro={intro} title={title} />
      {children ? <div className="container pt-6 pb-16">{children}</div> : null}
    </div>
  )
}