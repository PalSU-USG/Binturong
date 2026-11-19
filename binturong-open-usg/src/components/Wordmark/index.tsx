import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { cn } from '@/utilities/ui'

/**
 * USG emblem and two-line identity. The emblem is cut from slide 1 of the owner's Official USG
 * Branding Guide (20 November 2026), pending an original vector file. It is decorative
 * (`alt=""`): the adjacent text names it.
 */
export const Wordmark: React.FC<{ className?: string }> = ({ className }) => (
  <Link className={cn('site-wordmark', className)} href="/">
    <Image
      alt=""
      className="site-wordmark-seal"
      height={411}
      priority
      sizes="(min-width: 48rem) 90px, 60px"
      src="/brand/usg-emblem.png"
      width={512}
    />
    <span>
      <span className="site-wordmark-name">Palawan State University</span>
      <span className="sr-only"> – </span>
      <span className="site-wordmark-unit">University Student Government</span>
    </span>
  </Link>
)
