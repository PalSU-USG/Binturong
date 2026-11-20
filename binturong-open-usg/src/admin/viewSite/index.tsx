import React from 'react'

import { adminCopy } from '@/admin/copy'
import './index.scss'

/** Lets staff check the public site, the place their published work appears. */
export default function ViewSite() {
  return (
    <a className="view-site" href="/" rel="noopener" target="_blank">
      {adminCopy.viewSite}
      <span className="view-site__hidden"> (opens in a new tab)</span>
    </a>
  )
}
