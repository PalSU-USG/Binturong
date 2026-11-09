import React, { Suspense } from 'react'

import { Wordmark } from '@/components/Wordmark'
import { HeaderClient } from './Component.client'
import { HeaderNavigation, MinimalNavigation } from './Navigation'

export function Header() {
  return (
    <HeaderClient>
      <div className="site-header-bar">
        <Wordmark />
        <Suspense fallback={<MinimalNavigation />}>
          <HeaderNavigation />
        </Suspense>
      </div>
    </HeaderClient>
  )
}
