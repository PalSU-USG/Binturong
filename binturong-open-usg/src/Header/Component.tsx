import React, { Suspense } from 'react'

import { Wordmark } from '@/components/Wordmark'
import { HeaderClient } from './Component.client'
import { HeaderNavigation, MinimalNavigation } from './Navigation'

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
          <Suspense fallback={<MinimalNavigation />}>
            <HeaderNavigation />
          </Suspense>
        </div>
      </div>
    </HeaderClient>
  )
}
