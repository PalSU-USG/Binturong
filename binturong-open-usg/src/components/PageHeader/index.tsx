import React from 'react'

import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'

/**
 * The page identity band: breadcrumb and the page's single h1 on the PalSU rust, gold rule below.
 * A div, not a header element, so it is not announced as a second banner landmark.
 */
export function PageHeader({
  crumbs,
  title,
  eyebrow,
  intro,
}: {
  crumbs: Crumb[]
  title: string
  /** Short label above the title, such as a record type. */
  eyebrow?: React.ReactNode
  /** One plain line under the title. */
  intro?: React.ReactNode
}) {
  return (
    <div className="site-page-header">
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
