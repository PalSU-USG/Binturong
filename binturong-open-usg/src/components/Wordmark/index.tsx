import Link from 'next/link'
import React from 'react'

import { cn } from '@/utilities/ui'

/** Placeholder identity until approved seal and logo files arrive; plain text only. */
export const Wordmark: React.FC<{ className?: string }> = ({ className }) => (
  <Link className={cn('site-wordmark', className)} href="/">
    Palawan State University / University Student Government
  </Link>
)
