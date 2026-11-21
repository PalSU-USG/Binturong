import { cache } from 'react'
import type { CollectionSlug, Payload, Where } from 'payload'

import type { Activity, Issuance, Report } from '@/payload-types'
import { isRecent } from '@/search/params'
import { citation } from './citation'
import { resolveRichTextLinks } from './richTextLinks'
import { readReadyMainDocuments, type FileOwner } from './publicFileFacts'
import {
  issuanceTypes,
  MAX_PAGE,
  RECORD_PAGE_SIZE,
  type RecordFilters,
  type RecordScope,
} from './recordFilters'

/**
 * Public record reads. Every read here runs as an anonymous visitor (`overrideAccess: false`,
 * `draft: false`) and also asks for `_status = published` explicitly, so a signed-in editor's
 * session can never widen a public page. Unreadable references simply disappear; a draft,
 * withdrawn or unpublished target is never named, counted or linked.
 */

export type RecordRowData = {
  key: string
  collection: FileOwner | 'activities'
  id: number
  typeLabel: string
  identifier: string | null
  title: string
  href: string
  sourceDate: string | null
  sourceDateLabel: string | null
  publishedAt: string | null
  recent: boolean
  organization: string | null
  location: string | null
  time: string | null
  /** Controlled delivery route; null unless the main file is verified and ready. */
  fileHref: string | null
}

export type RecordList = {
  rows: RecordRowData[]
  total: number
  page: number
  pageCount: number
  notices: string[]
}

const published: Where = { _status: { equals: 'published' } }
const MAX_SLUG = 200

const relationID = (value: unknown): number | null => {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null
}
const ids = (...values: unknown[]) => values.flatMap((value) => relationID(value) ?? [])
const usableSlug = (slug: unknown): slug is string =>
  typeof slug === 'string' && slug.length > 0 && slug.length <= MAX_SLUG && !slug.includes('\0')

const reportLabels = { financial: 'Financial report', accomplishment: 'Accomplishment report' }
const issuanceLabel = (type: string | null | undefined) =>
  issuanceTypes.find((t) => t.value === type)?.label ?? 'Issuance'
const reportLabel = (type: string | null | undefined) =>
  reportLabels[type as keyof typeof reportLabels] ?? 'Report'

const base = { overrideAccess: false, draft: false, depth: 0 } as const

/** Names/labels of published targets by id. Missing or unpublished ids are simply absent. */
async function publishedFields(
  payload: Payload,
  collection: CollectionSlug,
  ids: number[],
  select: Record<string, true>,
): Promise<Map<number, Record<string, unknown>>> {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map()
  const { docs } = await payload.find({
    collection,
    ...base,
    pagination: false,
    select: select as never,
    where: { and: [{ id: { in: unique } }, published] },
  })
  return new Map(
    docs.map((doc) => [
      Number((doc as { id: number }).id),
      doc as unknown as Record<string, unknown>,
    ]),
  )
}

const textOf = (row: Record<string, unknown> | undefined, field: string): string | null => {
  const value = row?.[field]
  return typeof value === 'string' && value.trim() ? value : null
}

async function resolveYear(payload: Payload, slug: string | null, notices: string[]) {
  if (!slug) return null
  const { docs } = await payload.find({
    collection: 'academic-years',
    ...base,
    limit: 1,
    select: { label: true },
    where: { and: [{ slug: { equals: slug } }, published] },
  })
  if (docs[0]) return docs[0].id
  notices.push('Academic year not found; showing all years.')
  return null
}

const branchOf = (scope: RecordScope) =>
  scope === 'executive' || scope === 'legislative' || scope === 'judicial' ? scope : null

type Plan = { collection: FileOwner; where: Where }

async function planFor(
  payload: Payload,
  scope: RecordScope,
  filters: RecordFilters,
  notices: string[],
): Promise<Plan[] | 'none'> {
  const yearID = await resolveYear(payload, filters.year, notices)
  const common: Where[] = [published, ...(yearID ? [{ academicYear: { equals: yearID } }] : [])]
  let issuanceExtra: Where[] = []
  let reportExtra: Where[] = []

  if (scope === 'financial' || scope === 'accomplishment') {
    return [{ collection: 'reports', where: { and: [...common, { type: { equals: scope } }] } }]
  }
  const branch = branchOf(scope)
  if (branch) {
    const { docs } = await payload.find({
      collection: 'offices',
      ...base,
      pagination: false,
      select: { branch: true },
      where: { and: [published, { branch: { equals: branch } }] },
    })
    const ids = docs.map((doc) => doc.id)
    if (!ids.length) return 'none'
    issuanceExtra = [{ issuingOffice: { in: ids } }]
    reportExtra = [{ responsibleOffices: { in: ids } }]
  }
  if (scope === 'csg') {
    const { docs } = await payload.find({
      collection: 'organizations',
      ...base,
      pagination: false,
      select: { slug: true },
      where: { and: [published, { kind: { equals: 'csg' } }] },
    })
    let ids = docs.map((doc) => doc.id)
    if (filters.csg) {
      const match = docs.find((doc) => doc.slug === filters.csg)
      if (match) ids = [match.id]
      else notices.push('Participating CSG not found; showing all participating CSGs.')
    }
    if (!ids.length) return 'none'
    issuanceExtra = reportExtra = [{ organization: { in: ids } }]
  }

  const plans: Plan[] = [
    {
      collection: 'issuances',
      where: {
        and: [
          ...common,
          ...issuanceExtra,
          ...(filters.type ? [{ type: { equals: filters.type } }] : []),
        ],
      },
    },
  ]
  // Report types are not issuance types, so choosing an issuance type excludes reports.
  if (!filters.type)
    plans.push({ collection: 'reports', where: { and: [...common, ...reportExtra] } })
  return plans
}

type CommonDoc = Pick<
  Issuance,
  | 'id'
  | 'title'
  | 'slug'
  | 'publishedAt'
  | 'updatedAt'
  | 'organization'
  | 'academicYear'
  | 'relatedRecords'
> & { type?: string | null }
type ListedRow = Pick<CommonDoc, 'id' | 'title' | 'slug' | 'publishedAt' | 'organization'> & {
  mainDocument?: unknown
  academicYear?: unknown
  type?: string
  documentNumber?: string | null
  issuedDate?: string | null
  reportingPeriod?: string | null
  periodEndDate?: string | null
}

const SELECT = {
  issuances: {
    title: true,
    slug: true,
    publishedAt: true,
    organization: true,
    type: true,
    documentNumber: true,
    issuedDate: true,
    academicYear: true,
  },
  reports: {
    title: true,
    slug: true,
    publishedAt: true,
    organization: true,
    type: true,
    reportingPeriod: true,
    periodEndDate: true,
  },
} as const

const order = (a: ListedRow & { collection: string }, b: ListedRow & { collection: string }) => {
  // Same order as the database sort: newest first, empty dates first, then id descending.
  const at = a.publishedAt ? Date.parse(a.publishedAt) : Infinity
  const bt = b.publishedAt ? Date.parse(b.publishedAt) : Infinity
  return bt - at || b.collection.localeCompare(a.collection) || b.id - a.id
}

export async function listRecords(
  payload: Payload,
  scope: RecordScope,
  filters: RecordFilters,
  now: Date = new Date(),
): Promise<RecordList> {
  const notices = [...filters.notices]
  const plans = await planFor(payload, scope, filters, notices)
  if (plans === 'none') return { rows: [], total: 0, page: 1, pageCount: 0, notices }

  const wanted = Math.min(Math.max(1, Math.trunc(filters.page) || 1), MAX_PAGE)
  // Each collection is sorted by (publishedAt desc, id desc); fetching the first `wanted` pages of
  // each lets a merged page be cut exactly. Depth is bounded by MAX_PAGE.
  const results = await Promise.all(
    plans.map(async ({ collection, where }) => {
      const result = await payload.find({
        collection,
        ...base,
        limit: wanted * RECORD_PAGE_SIZE,
        page: 1,
        sort: ['-publishedAt', '-id'],
        select: SELECT[collection] as never,
        where,
      })
      return { collection, total: result.totalDocs, docs: result.docs as unknown as ListedRow[] }
    }),
  )
  const total = results.reduce((sum, r) => sum + r.total, 0)
  const pageCount = Math.ceil(total / RECORD_PAGE_SIZE)
  const page = Math.max(1, Math.min(wanted, pageCount))
  const slice = results
    .flatMap((r) => r.docs.map((doc) => ({ ...doc, collection: r.collection })))
    .sort(order)
    .slice((page - 1) * RECORD_PAGE_SIZE, page * RECORD_PAGE_SIZE)

  const rows = await toRows(payload, slice, now)
  return { rows, total, page, pageCount, notices }
}

async function toRows(
  payload: Payload,
  items: (ListedRow & { collection: FileOwner })[],
  now: Date,
): Promise<RecordRowData[]> {
  const orgs = await publishedFields(
    payload,
    'organizations',
    items.flatMap((i) => relationID(i.organization) ?? []),
    { name: true },
  )
  const years = await publishedFields(
    payload,
    'academic-years',
    items.flatMap((i) => (i.collection === 'issuances' ? ids(i.academicYear) : [])),
    { label: true },
  )
  const files = new Map<FileOwner, Map<number, number>>()
  for (const collection of ['issuances', 'reports'] as const) {
    const ids = items.filter((i) => i.collection === collection).map((i) => i.id)
    try {
      files.set(collection, await readReadyMainDocuments(payload, collection, ids))
    } catch (error) {
      // The record is still listed; only its direct PDF shortcut is withheld.
      console.error(
        'Record file links unavailable:',
        error instanceof Error ? error.message : 'unknown',
      )
      files.set(collection, new Map())
    }
  }
  return items.map((item) => {
    const isIssuance = item.collection === 'issuances'
    const documentID = files.get(item.collection)?.get(item.id)
    const typeLabel = isIssuance ? issuanceLabel(item.type) : reportLabel(item.type)
    const raw = (isIssuance ? item.documentNumber : item.reportingPeriod)?.trim() || null
    const cited =
      isIssuance &&
      citation({
        typeLabel,
        documentNumber: raw,
        seriesLabel: textOf(years.get(relationID(item.academicYear) ?? 0), 'label'),
      })
    return {
      key: `${item.collection}-${item.id}`,
      collection: item.collection,
      id: item.id,
      typeLabel,
      identifier: cited || raw,
      title: item.title,
      href: `/${item.collection}/${encodeURIComponent(item.slug ?? '')}`,
      sourceDate: (isIssuance ? item.issuedDate : item.periodEndDate) ?? null,
      sourceDateLabel: isIssuance ? 'Issued' : 'Period ends',
      publishedAt: item.publishedAt ?? null,
      recent: isRecent(item.publishedAt, now),
      organization: textOf(orgs.get(relationID(item.organization) ?? 0), 'name'),
      location: null,
      time: null,
      fileHref: documentID ? `/api/documents/${documentID}/file` : null,
    }
  })
}

type ListedActivity = Pick<
  Activity,
  'id' | 'title' | 'slug' | 'publishedAt' | 'organization' | 'eventDate' | 'time' | 'location'
>
const ACTIVITY_SELECT = {
  title: true,
  slug: true,
  publishedAt: true,
  organization: true,
  eventDate: true,
  time: true,
  location: true,
} as const

async function activityRows(
  payload: Payload,
  docs: ListedActivity[],
  now: Date,
): Promise<RecordRowData[]> {
  const orgs = await publishedFields(
    payload,
    'organizations',
    docs.flatMap((doc) => relationID(doc.organization) ?? []),
    { name: true },
  )
  return docs.map((doc): RecordRowData => ({
    key: `activities-${doc.id}`,
    collection: 'activities',
    id: doc.id,
    typeLabel: 'Activity',
    identifier: null,
    title: doc.title,
    href: `/activities/${encodeURIComponent(doc.slug ?? '')}`,
    sourceDate: doc.eventDate ?? null,
    sourceDateLabel: 'Date',
    publishedAt: doc.publishedAt ?? null,
    recent: isRecent(doc.publishedAt, now),
    organization: textOf(orgs.get(relationID(doc.organization) ?? 0), 'name'),
    location: doc.location?.trim() || null,
    time: doc.time?.trim() || null,
    fileHref: null,
  }))
}

/**
 * Published activities on or after `fromDate` (an ISO instant at UTC midnight of a calendar
 * date), soonest first. Past activities stay on their own records and list.
 */
export async function listUpcomingActivities(
  payload: Payload,
  fromDate: string,
  limit: number,
  now: Date = new Date(),
): Promise<RecordRowData[]> {
  const { docs } = await payload.find({
    collection: 'activities',
    ...base,
    limit,
    page: 1,
    sort: ['eventDate', 'id'],
    select: ACTIVITY_SELECT,
    where: { and: [published, { eventDate: { greater_than_equal: fromDate } }] },
  })
  return activityRows(payload, docs, now)
}
export async function listActivities(
  payload: Payload,
  filters: RecordFilters,
  now: Date = new Date(),
): Promise<RecordList> {
  const notices = [...filters.notices]
  const yearID = await resolveYear(payload, filters.year, notices)
  const wanted = Math.min(Math.max(1, Math.trunc(filters.page) || 1), MAX_PAGE)
  const fetchPage = (page: number) =>
    payload.find({
      collection: 'activities',
      ...base,
      limit: RECORD_PAGE_SIZE,
      page,
      sort: ['-eventDate', '-id'],
      select: ACTIVITY_SELECT,
      where: { and: [published, ...(yearID ? [{ academicYear: { equals: yearID } }] : [])] },
    })
  let result = await fetchPage(wanted)
  // An over-range page shows the last page instead of an empty state while records exist.
  if (result.docs.length === 0 && result.totalPages > 0 && wanted > result.totalPages)
    result = await fetchPage(result.totalPages)
  const rows = await activityRows(payload, result.docs, now)
  return {
    rows,
    total: result.totalDocs,
    page: Math.min(wanted, Math.max(1, result.totalPages)),
    pageCount: result.totalPages,
    notices,
  }
}

export type RelatedRecord = { title: string; href: string; typeLabel: string }
export type PublicRecord = {
  collection: FileOwner
  id: number
  slug: string
  title: string
  typeLabel: string
  identifier: string | null
  publishedAt: string | null
  updatedAt: string | null
  issuedDate: string | null
  effectiveDate: string | null
  reportingPeriod: string | null
  periodStartDate: string | null
  periodEndDate: string | null
  sourceVersionLabel: string | null
  summary: Issuance['summary'] | null
  organization: string | null
  offices: { name: string; href: string }[]
  academicYear: string | null
  related: RelatedRecord[]
}

const relatedTargets = {
  issuances: { path: '/issuances', label: 'Issuance' },
  reports: { path: '/reports', label: 'Report' },
  activities: { path: '/activities', label: 'Activity' },
  posts: { path: '/posts', label: 'Update' },
} as const

async function readRelated(payload: Payload, raw: unknown): Promise<RelatedRecord[]> {
  const refs = (Array.isArray(raw) ? raw : []).flatMap((item) => {
    const relationTo = item?.relationTo as keyof typeof relatedTargets
    const id = relationID(item?.value)
    return id && Object.hasOwn(relatedTargets, relationTo) ? [{ relationTo, id }] : []
  })
  const found = new Map<string, Record<string, unknown>>()
  for (const relationTo of Object.keys(relatedTargets) as (keyof typeof relatedTargets)[]) {
    const rows = await publishedFields(
      payload,
      relationTo,
      refs.filter((r) => r.relationTo === relationTo).map((r) => r.id),
      { title: true, slug: true },
    )
    rows.forEach((row, id) => found.set(`${relationTo}:${id}`, row))
  }
  const seen = new Set<string>()
  return refs.flatMap(({ relationTo, id }) => {
    const key = `${relationTo}:${id}`
    const row = found.get(key)
    const title = textOf(row, 'title')
    const slug = row?.slug
    if (!title || !usableSlug(slug) || seen.has(key)) return []
    seen.add(key)
    const target = relatedTargets[relationTo]
    return [{ title, href: `${target.path}/${encodeURIComponent(slug)}`, typeLabel: target.label }]
  })
}

/** A currently published Issuance or Report by slug, or null. Never reads a draft. */
export const readPublicRecord = cache(async function readPublicRecord(
  payload: Payload,
  collection: FileOwner,
  slug: string,
): Promise<PublicRecord | null> {
  if (!usableSlug(slug)) return null
  const { docs } = await payload.find({
    collection,
    ...base,
    limit: 1,
    where: { and: [{ slug: { equals: slug } }, published] },
  })
  const doc = docs[0] as unknown as CommonDoc | undefined
  if (!doc || !usableSlug(doc.slug)) return null
  const isIssuanceDoc = collection === 'issuances'

  const officeIDs =
    collection === 'issuances'
      ? [relationID((doc as Issuance).issuingOffice)]
      : ((doc as Report).responsibleOffices ?? []).map(relationID)
  const richSource = isIssuanceDoc ? (doc as Issuance).summary : (doc as Report).abstract
  const [orgs, offices, years, related, summary] = await Promise.all([
    publishedFields(payload, 'organizations', ids(doc.organization), { name: true }),
    publishedFields(
      payload,
      'offices',
      officeIDs.flatMap((id) => id ?? []),
      { name: true, slug: true },
    ),
    publishedFields(payload, 'academic-years', ids(doc.academicYear), {
      label: true,
    }),
    readRelated(payload, doc.relatedRecords),
    resolveRichTextLinks(payload, richSource),
  ])
  const isIssuance = collection === 'issuances'
  const issuance = doc as Issuance
  const report = doc as Report
  return {
    collection,
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    typeLabel: isIssuance ? issuanceLabel(doc.type) : reportLabel(doc.type),
    identifier: (isIssuance ? issuance.documentNumber : report.reportingPeriod)?.trim() || null,
    publishedAt: doc.publishedAt ?? null,
    updatedAt: doc.updatedAt ?? null,
    issuedDate: isIssuance ? (issuance.issuedDate ?? null) : null,
    effectiveDate: isIssuance ? (issuance.effectiveDate ?? null) : null,
    reportingPeriod: isIssuance ? null : report.reportingPeriod?.trim() || null,
    periodStartDate: isIssuance ? null : (report.periodStartDate ?? null),
    periodEndDate: isIssuance ? null : (report.periodEndDate ?? null),
    sourceVersionLabel: isIssuance ? null : report.sourceVersionLabel?.trim() || null,
    summary,
    organization: textOf(orgs.get(relationID(doc.organization) ?? 0), 'name'),
    offices: officeIDs.flatMap((id) => {
      const row = offices.get(id ?? 0)
      const name = textOf(row, 'name')
      return name && usableSlug(row?.slug)
        ? [{ name, href: `/government/offices/${encodeURIComponent(row.slug as string)}` }]
        : []
    }),
    academicYear: textOf(years.get(relationID(doc.academicYear) ?? 0), 'label'),
    related,
  }
})

export type PublicActivity = {
  id: number
  slug: string
  title: string
  eventDate: string
  time: string | null
  location: string | null
  organization: string | null
  academicYear: string | null
  description: Activity['description'] | null
  publishedAt: string | null
  updatedAt: string | null
}

export const readPublicActivity = cache(async function readPublicActivity(
  payload: Payload,
  slug: string,
): Promise<PublicActivity | null> {
  if (!usableSlug(slug)) return null
  const { docs } = await payload.find({
    collection: 'activities',
    ...base,
    limit: 1,
    where: { and: [{ slug: { equals: slug } }, published] },
  })
  const doc = docs[0]
  if (!doc || !usableSlug(doc.slug)) return null
  const [orgs, years, description] = await Promise.all([
    publishedFields(payload, 'organizations', ids(doc.organization), { name: true }),
    publishedFields(payload, 'academic-years', ids(doc.academicYear), {
      label: true,
    }),
    resolveRichTextLinks(payload, doc.description),
  ])
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    eventDate: doc.eventDate,
    time: doc.time?.trim() || null,
    location: doc.location?.trim() || null,
    organization: textOf(orgs.get(relationID(doc.organization) ?? 0), 'name'),
    academicYear: textOf(years.get(relationID(doc.academicYear) ?? 0), 'label'),
    description,
    publishedAt: doc.publishedAt ?? null,
    updatedAt: doc.updatedAt ?? null,
  }
})

export type YearOption = { slug: string; label: string }

/** Published academic years for the filter control. */
export async function listAcademicYears(payload: Payload): Promise<YearOption[]> {
  const { docs } = await payload.find({
    collection: 'academic-years',
    ...base,
    limit: 100,
    sort: ['-startDate', '-label'],
    select: { label: true, slug: true },
    where: published,
  })
  return docs.flatMap((doc) =>
    usableSlug(doc.slug) && doc.label?.trim() ? [{ slug: doc.slug, label: doc.label }] : [],
  )
}
