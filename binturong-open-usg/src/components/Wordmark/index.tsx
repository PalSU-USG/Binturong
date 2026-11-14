import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { cn } from '@/utilities/ui'

/**
 * USG logo and two-line identity. The logo is a placeholder the owner supplied, pending an
 * approved original file. It is decorative (`alt=""`): the adjacent text names it.
 */
export const Wordmark: React.FC<{ className?: string }> = ({ className }) => (
  <Link className={cn('site-wordmark', className)} href="/">
    <Image
      alt=""
      className="site-wordmark-seal rounded-full"
      height={72}
      priority
      sizes="(min-width: 48rem) 72px, 48px"
      src="/brand/usg-logo.png"
      width={72}
    />
    <span>
      <span className="site-wordmark-name">Palawan State University</span>
      <span className="sr-only"> – </span>
      <span className="site-wordmark-unit">University Student Government</span>
    </span>
  </Link>
)
