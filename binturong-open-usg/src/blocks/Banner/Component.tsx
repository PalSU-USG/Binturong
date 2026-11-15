import type { BannerBlock as BannerBlockProps } from 'src/payload-types'

import { cn } from '@/utilities/ui'
import React from 'react'
import RichText from '@/components/RichText'

type Props = {
  className?: string
} & BannerBlockProps

export const BannerBlock: React.FC<Props> = ({ className, content, style }) => {
  return (
    <div className={cn('mx-auto my-8 w-full', className)}>
      <div
        className={cn('flex items-center rounded-sm border border-l-4 px-6 py-3', {
          'border-status-info-border bg-status-info-bg text-status-info-fg': style === 'info',
          'border-status-error-border bg-status-error-bg text-status-error-fg': style === 'error',
          'border-status-success-border bg-status-success-bg text-status-success-fg':
            style === 'success',
          'border-status-warning-border bg-status-warning-bg text-status-warning-fg':
            style === 'warning',
        })}
      >
        <RichText data={content} enableGutter={false} enableProse={false} />
      </div>
    </div>
  )
}
