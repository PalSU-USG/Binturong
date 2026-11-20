import React from 'react'

import type { Post } from '@/payload-types'

import { Media } from '@/components/Media'
import { formatInstantDate } from '@/components/records/format'
import { formatAuthors } from '@/utilities/formatAuthors'

/** Category titles for the identity band's eyebrow; null when the post has none. */
export function postCategoryLabel(post: Post): string | null {
  const titles = (post.categories ?? []).flatMap((category) =>
    typeof category === 'object' && category !== null
      ? [category.title || 'Untitled category']
      : [],
  )
  return titles.length ? titles.join(', ') : null
}

/** Byline and hero image under the page band; the title itself lives in the band's h1. */
export const PostHero: React.FC<{
  post: Post
}> = ({ post }) => {
  const { heroImage, populatedAuthors, publishedAt } = post

  const hasAuthors =
    populatedAuthors && populatedAuthors.length > 0 && formatAuthors(populatedAuthors) !== ''

  return (
    <div className="mx-auto max-w-[48rem]">
      {(hasAuthors || publishedAt) && (
        <dl className="m-0 flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:gap-12">
          {hasAuthors && (
            <div>
              <dt className="text-[length:var(--text-meta)] text-muted-foreground">Author</dt>
              <dd className="m-0">{formatAuthors(populatedAuthors)}</dd>
            </div>
          )}
          {publishedAt && (
            <div>
              <dt className="text-[length:var(--text-meta)] text-muted-foreground">
                Date published
              </dt>
              <dd className="m-0">
                <time dateTime={publishedAt}>{formatInstantDate(publishedAt)}</time>
              </dd>
            </div>
          )}
        </dl>
      )}
      {heroImage && typeof heroImage === 'object' && (
        <Media
          className="mt-6 overflow-hidden"
          imgClassName="aspect-[16/9] h-auto w-full object-cover"
          priority
          resource={heroImage}
        />
      )}
    </div>
  )
}
