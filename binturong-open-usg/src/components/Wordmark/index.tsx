import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { cn } from '@/utilities/ui'

/**
 * PalSU seal and two-line identity. The seal is the owner's Project Akademya file, pending an
 * approved original (see tokens.css). It is decorative (`alt=""`): the adjacent text names it.
 */
export const Wordmark: React.FC<{ className?: string }> = ({ className }) => (
  <Link className={cn('site-wordmark', className)} href="/">
    <Image
      alt=""
      className="site-wordmark-seal"
      height={72}
      priority
      sizes="(min-width: 48rem) 72px, 48px"
      src="/brand/palsu-seal.png"
      width={72}
    />
    <span>
      <span className="site-wordmark-name">Palawan State University</span>
      <span className="sr-only"> – </span>
      <span className="site-wordmark-unit">University Student Government</span>
    </span>
  </Link>
)
