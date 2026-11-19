import React from 'react'

import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'

/** Branches with their own colour in the USG branding guide. */
export type Branch = 'legislative' | 'judicial'

/**
 * The page identity band: breadcrumb and the page's single h1 on the USG deep brown, gold rule
 * below (the branch colour on Legislative and Judicial pages). A div, not a header element, so it
 * is not announced as a second banner landmark.
 */
export function PageHeader({
  crumbs,
  title,
  eyebrow,
  intro,
  branch,
}: {
  crumbs: Crumb[]
  title: string
  /** Short label above the title, such as a record type. */
  eyebrow?: React.ReactNode
  /** One plain line under the title. */
  intro?: React.ReactNode
  branch?: Branch
}) {
  return (
    <div className="site-page-header" data-branch={branch}>
      <div className="container">
        <Breadcrumbs items={crumbs} />
        <div className="site-page-header-body">
          {eyebrow ? <p className="site-page-header-eyebrow">{eyebrow}</p> : null}
          <h1 className="site-page-header-title">{title}</h1>
          {intro ? <p className="site-page-header-intro">{intro}</p> : null}
        </div>
      </div>
    </div>
  )
}
