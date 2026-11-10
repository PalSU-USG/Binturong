import type { Payload, Where } from 'payload'

import { findSection, resolveNavigation, type NavItem } from '@/Header/resolveNavigation'
import { listRecords, listUpcomingActivities, type RecordRowData } from '@/records/recordQueries'
import { parseRecordFilters } from '@/records/recordFilters'
import { searchTargets } from '@/search/searchTargets'

/**
 * Front-page reads. Every read runs as an anonymous visitor (`overrideAccess: false`,
 * `draft: false`) and also filters to `_status = published`, so neither layer alone decides what
 * the public sees. A failed read throws; an empty array always means "nothing published".
 */

export const HOME_ROWS = 5
export const NOTICE_DAYS = 14
/** Freshness window of Latest updates; older items are found through Archives and Search. */
export const UPDATE_DAYS = 30
export const DEFAULT_POST_TAG = 'Announcement'
export const NOTICE_CATEGORY_SLUG = 'notice'
const MANILA_OFFSET_MS = 8 * 3_600_000
const DAY_MS = 86_400_000

export type HomeEntry = {
  key: string
  date: string | null
  dateLabel: string | null
  label: string | null
  title: string
  href: string
  /** True for a publish instant (shown in Manila time); false for a date-only value (shown as stored). */
  instant: boolean
  meta: string | null
  /** Controlled delivery route; null unless the main file is verified and ready. */
  fileHref: string | null
  /** Decides the row action: Read (update), Record (issuance or report), none for activities. */
  kind: 'update' | 'record' | 'activity'
}
export type HomeNotice = { title: string; href: string; date: string | null }
export type HomeLink = { label: string; href: string; newTab: boolean }
export type HomeData = {
  notice: HomeNotice | null
  /** Posts and records published in the last 30 days, newest first (see updatesFresh). */
  updates: HomeEntry[]
  /** False when nothing is that fresh and `updates` holds the newest older items instead. */
  updatesFresh: boolean
  /** Null when no record type has a live route; otherwise rows (possibly none). */
  records: HomeEntry[] | null
  activities: HomeEntry[]
  services: HomeLink[]
  transparency: HomeLink[]
}

const base = { overrideAccess: false, draft: false } as const
const published: Where = { _status: { equals: 'published' } }

const usableSlug = (slug: unknown): slug is string =>
  typeof slug === 'string' && slug.length > 0 && slug.length <= 200 && !slug.includes('\0')

export function liveRecordCollections(
  targets: Record<string, { live: boolean }> = searchTargets,
): ('issuances' | 'reports')[] {
  return (['issuances', 'reports'] as const).filter((slug) => targets[slug]?.live === true)
}

/** Verified child links of a navigation section. Unavailable or placeholder links are dropped. */
export function homeLinksFor(
  items: NavItem[],
  section: NonNullable<NavItem['section']>,
): HomeLink[] {
  return (findSection(items, section)?.children ?? []).flatMap((child) => {
    const href = child.href?.trim()
    return child.available && href && href !== '#'
      ? [{ label: child.label, href, newTab: child.newTab }]
      : []
  })
}

/**
 * Date-only fields (ventDate) are stored at 12:00 UTC of their calendar date, so comparing against
 * UTC midnight of the Manila calendar date keeps an event on its own day. "Today" is the Manila date.
 */
export function upcomingFrom(now: Date): string {
  return `${new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10)}T00:00:00.000Z`
}

const fromRecord = (row: RecordRowData): HomeEntry => ({
  key: row.key,
  date: row.sourceDate ?? row.publishedAt,
  instant: !row.sourceDate,
  dateLabel: row.sourceDate ? row.sourceDateLabel : 'Published',
  label: row.typeLabel,
  title: row.title,
  href: row.href,
  meta: row.identifier,
  fileHref: row.fileHref,
  kind: 'record',
})

/** A record as a Latest updates row: dated by when it was published, which freshness uses. */
const updateFromRecord = (row: RecordRowData): HomeEntry => ({
  ...fromRecord(row),
  date: row.publishedAt,
  instant: true,
  dateLabel: 'Published',
})

const fromActivity = (row: RecordRowData): HomeEntry => ({
  key: row.key,
  date: row.sourceDate,
  instant: false,
  dateLabel: 'Date',
  label: row.typeLabel,
  title: row.title,
  href: row.href,
  meta: [row.time, row.location].filter(Boolean).join(' · ') || null,
  fileHref: null,
  kind: 'activity',
})

async function readPosts(payload: Payload, now: Date): Promise<HomeEntry[]> {
  const { docs } = await payload.find({
    collection: 'posts',
    ...base,
    depth: 1,
    limit: HOME_ROWS,
    sort: ['-publishedAt', '-id'],
    select: { title: true, slug: true, publishedAt: true, categories: true },
    // A future publishedAt is not yet an update (same rule as the notice).
    where: { and: [published, { publishedAt: { less_than_equal: now.toISOString() } }] },
  })
  return docs.flatMap((doc) => {
    if (!usableSlug(doc.slug)) return []
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
        meta: null,
        fileHref: null,
        kind: 'update' as const,
      },
    ]
  })
}

async function readNotice(payload: Payload, now: Date): Promise<HomeNotice | null> {
  const since = new Date(now.getTime() - NOTICE_DAYS * DAY_MS).toISOString()
  const { docs } = await payload.find({
    collection: 'posts',
    ...base,
    depth: 0,
    limit: 1,
    sort: ['-publishedAt', '-id'],
    select: { title: true, slug: true, publishedAt: true },
    where: {
      and: [
        published,
        { 'categories.slug': { equals: NOTICE_CATEGORY_SLUG } },
        { publishedAt: { greater_than_equal: since } },
        { publishedAt: { less_than_equal: now.toISOString() } },
      ],
    },
  })
  const doc = docs[0]
  if (!doc || !usableSlug(doc.slug)) return null
  return {
    title: doc.title,
    href: `/posts/${encodeURIComponent(doc.slug)}`,
    date: doc.publishedAt ?? null,
  }
}

/** Newest published issuances and reports (one page); null when no type has a live route. */
async function readRecordRows(payload: Payload, now: Date): Promise<RecordRowData[] | null> {
  const live = liveRecordCollections()
  if (live.length === 0) return null
  const { rows } = await listRecords(payload, 'archives', parseRecordFilters({}, 'archives'), now)
  return rows.filter((row) => (live as string[]).includes(row.collection))
}

/**
 * Mixed Latest updates: posts plus issuances and reports published in the last 30 days, newest
 * first. When nothing is that fresh the newest older items are shown and `fresh` is false, so the
 * page can say so instead of presenting old items as recent.
 */
export function mergeUpdates(
  posts: HomeEntry[],
  records: RecordRowData[],
  now: Date,
): { updates: HomeEntry[]; fresh: boolean } {
  const upper = now.getTime()
  const since = upper - UPDATE_DAYS * DAY_MS
  const dated = records.filter((row) => row.publishedAt && Date.parse(row.publishedAt) <= upper)
  const all = [...posts, ...dated.map(updateFromRecord)].sort(
    (a, b) => Date.parse(b.date ?? '') - Date.parse(a.date ?? '') || (a.key < b.key ? 1 : -1),
  )
  const fresh = all.filter((entry) => Date.parse(entry.date ?? '') >= since)
  return fresh.length
    ? { updates: fresh.slice(0, HOME_ROWS), fresh: true }
    : { updates: all.slice(0, HOME_ROWS), fresh: false }
}

async function readNavigation(payload: Payload) {
  const header = await payload.findGlobal({ slug: 'header', ...base, depth: 1 })
  const items = resolveNavigation(header)
  return {
    services: homeLinksFor(items, 'services'),
    transparency: homeLinksFor(items, 'transparency'),
  }
}

export async function getHomeData(payload: Payload, now: Date = new Date()): Promise<HomeData> {
  const [notice, posts, recordRows, upcoming, navigation] = await Promise.all([
    readNotice(payload, now),
    readPosts(payload, now),
    readRecordRows(payload, now),
    listUpcomingActivities(payload, upcomingFrom(now), HOME_ROWS, now),
    readNavigation(payload),
  ])
  const { updates, fresh } = mergeUpdates(posts, recordRows ?? [], now)
  // Latest issuances lists issuances only; reports surface in Latest updates and Transparency.
  const records =
    recordRows &&
    recordRows
      .filter((row) => row.collection === 'issuances')
      .slice(0, HOME_ROWS)
      .map(fromRecord)
  return {
    notice,
    updates,
    updatesFresh: fresh,
    records,
    activities: upcoming.map(fromActivity),
    ...navigation,
  }
}
