import React from 'react'

import { Wordmark } from '@/components/Wordmark'
import { HeaderClient } from './Component.client'
import { HeaderNavigation } from './Navigation'

export function Header() {
  return (
    <HeaderClient>
      <div className="site-authority">
        <div className="container">
          <Wordmark />
        </div>
      </div>
      <div className="site-navband">
        <div className="container">
          <HeaderNavigation />
        </div>
      </div>
    </HeaderClient>
  )
}
