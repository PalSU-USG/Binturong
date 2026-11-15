import configPromise from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { Pager } from '@/components/Pager'
import { UpdateList } from '@/components/home/HomeSections'
import { SectionLayout } from '@/components/SectionLayout'
import { DEFAULT_POST_TAG, type HomeEntry } from '@/home/getHomeData'

export const UPDATES_PAGE_SIZE = 12
const pageHref = (page: number) => (page <= 1 ? '/posts' : `/posts/page/${page}`)

/** Latest updates as editorial rows. Reads as an anonymous visitor: published posts only. */
export async function UpdatesListing({ page }: { page: number }) {
  const payload = await getPayload({ config: configPromise })
  const posts = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: UPDATES_PAGE_SIZE,
    page,
    sort: ['-publishedAt', '-id'],
    overrideAccess: false,
    draft: false,
    select: { title: true, slug: true, categories: true, meta: true, publishedAt: true },
  })
  if (page > 1 && posts.docs.length === 0) notFound()

  const entries: HomeEntry[] = posts.docs.flatMap((doc) => {
    if (!doc.slug) return []
    const category = (doc.categories ?? []).find(
      (c): c is Exclude<typeof c, number> => typeof c === 'object' && c !== null,
    )
    return [
      {
        key: `posts-${doc.id}`,
        date: doc.publishedAt ?? null,
        instant: true,
        dateLabel: 'Published',
        label: category?.title?.trim() || DEFAULT_POST_TAG,
        title: doc.title,
        href: `/posts/${encodeURIComponent(doc.slug)}`,
        meta: doc.meta?.description?.trim() || null,
        fileHref: null,
        kind: 'update' as const,
      },
    ]
  })

  return (
    <SectionLayout
      currentPath="/posts"
      fallback={{ label: 'Latest Updates', href: '/posts' }}
      section="updates"
      title="Latest updates"
      trail={page > 1 ? [{ label: `Page ${page}` }] : []}
    >
      <div className="pt-6 pb-16">
        {entries.length === 0 ? (
          <p role="status">No updates have been published yet.</p>
        ) : (
          <>
            <UpdateList entries={entries} />
            {posts.totalPages > 1 && (
              <Pager
                label="Updates pages"
                next={posts.hasNextPage ? { href: pageHref(page + 1), text: 'Older updates' } : undefined}
                page={page}
                prev={posts.hasPrevPage ? { href: pageHref(page - 1), text: 'Newer updates' } : undefined}
                totalPages={posts.totalPages}
              />
            )}
          </>
        )}
      </div>
    </SectionLayout>
  )
}
