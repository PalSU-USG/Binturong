import type { CollectionSlug, PayloadRequest, Where } from 'payload'

import { getActiveAccount } from '@/access/activeAccount'
import { adminCopy } from '@/admin/copy'
import { domainCollections } from '@/collections/shared/domainCollections'

const sources = ['pages', 'posts', ...domainCollections] as const
type Source = (typeof sources)[number]
const LIMIT = 5

export type DraftItem = {
  collection: Source
  id: number | string
  title: string
  updatedAt: string
  href: string
}
export type RecentItem = {
  collection: Source
  id: number | string
  title: string
  action: 'Published' | 'Withdrawn' | 'Restored'
  at: string
  href: string
}
export type DashboardResult<T> = { ok: true; items: T[] } | { ok: false; error: string }

const failure = { ok: false, error: adminCopy.loadError } as const
const titleField = (req: PayloadRequest, slug: Source): string => {
  const field = req.payload.collections[slug]?.config.admin?.useAsTitle
  return typeof field === 'string' ? field : 'title'
}
const href = (slug: Source, id: number | string) => `/admin/collections/${slug}/${id}`

/** Run one small, access-checked read per source. Any failure fails the whole list visibly. */
async function readAll<T>(
  req: PayloadRequest,
  read: (slug: Source, title: string, accountID: number) => Promise<T[]>,
): Promise<DashboardResult<T>> {
  try {
    const actor = await getActiveAccount(req)
    if (!actor) return failure
    const settled = await Promise.allSettled(
      sources.map((slug) => read(slug, titleField(req, slug), actor.id)),
    )
    if (settled.some((entry) => entry.status === 'rejected')) return failure
    return {
      ok: true,
      items: settled.flatMap((entry) => (entry.status === 'fulfilled' ? entry.value : [])),
    }
  } catch {
    return failure
  }
}

/**
 * Unpublished work (never published, withdrawn, or saved changes to a live item).
 * `mine` limits it to what the signed-in person last saved; `oldestFirst` is the
 * publisher's queue. Reads use the request user's own access, never privileged access.
 */
export async function loadDrafts(
  req: PayloadRequest,
  options: { mine?: boolean; oldestFirst?: boolean } = {},
): Promise<DashboardResult<DraftItem>> {
  const result = await readAll<DraftItem>(req, async (slug, title, accountID) => {
    const where: Where = options.mine
      ? { and: [{ _status: { equals: 'draft' } }, { lastEditedBy: { equals: accountID } }] }
      : { _status: { equals: 'draft' } }
    const { docs } = await req.payload.find({
      collection: slug as CollectionSlug,
      draft: true,
      where,
      sort: options.oldestFirst ? 'updatedAt' : '-updatedAt',
      limit: LIMIT,
      depth: 0,
      pagination: false,
      select: { [title]: true, updatedAt: true } as never,
      overrideAccess: false,
      req,
    })
    return docs.flatMap((doc): DraftItem[] => {
      const row = doc as unknown as Record<string, unknown>
      // A draft version whose record no longer exists has no id to open; never link to it.
      if (row.id == null) return []
      return [
        {
          collection: slug,
          id: row.id as number | string,
          title: String(row[title] ?? ''),
          updatedAt: String(row.updatedAt),
          href: href(slug, row.id as number | string),
        },
      ]
    })
  })
  if (!result.ok) return result
  const items = result.items.sort((a, b) =>
    options.oldestFirst
      ? Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
      : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  )
  return { ok: true, items: items.slice(0, LIMIT) }
}

const actions = { publish: 'Published', withdraw: 'Withdrawn', restore: 'Restored' } as const

/** Latest publications and withdrawals: what and when, never who. */
export async function loadRecentChanges(req: PayloadRequest): Promise<DashboardResult<RecentItem>> {
  const result = await readAll<RecentItem>(req, async (slug, title) => {
    const isDomain = slug !== 'pages' && slug !== 'posts'
    const { docs } = await req.payload.find({
      collection: slug as CollectionSlug,
      where: isDomain
        ? { 'lastTransition.at': { exists: true } }
        : { _status: { equals: 'published' } },
      sort: isDomain ? '-lastTransition.at' : '-publishedAt',
      limit: LIMIT,
      depth: 0,
      pagination: false,
      select: (isDomain
        ? { [title]: true, lastTransition: { action: true, at: true } }
        : { [title]: true, publishedAt: true }) as never,
      overrideAccess: false,
      req,
    })
    return docs.flatMap((doc): RecentItem[] => {
      const row = doc as unknown as Record<string, unknown>
      const transition = row.lastTransition as { action?: string; at?: string } | undefined
      const at = isDomain ? transition?.at : (row.publishedAt as string | undefined)
      const action = isDomain
        ? actions[transition?.action as keyof typeof actions]
        : ('Published' as const)
      if (row.id == null || !at || !action) return []
      return [
        {
          collection: slug,
          id: row.id as number | string,
          title: String(row[title] ?? ''),
          action,
          at: String(at),
          href: href(slug, row.id as number | string),
        },
      ]
    })
  })
  if (!result.ok) return result
  const items = result.items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return { ok: true, items: items.slice(0, LIMIT) }
}
