import type { Payload, Where } from 'payload'

import { normalizeIdentifier } from './identifier'
import { cleanQueryText, isRecent, type SearchType } from './params'
import {
  indexedCollections,
  isIndexedCollection,
  relationIn,
  searchCanonicalPath,
  searchTargets,
  type SearchCollection,
} from './searchTargets'

export const PAGE_SIZE = 12
const MAX_WORDS = 8
const TEXT_FIELDS = ['title', 'identifier', 'summary', 'meta.title', 'meta.description', 'slug']

export type SearchHit = {
  label: string
  title: string
  href: string
  identifier: string | null
  summary: string | null
  publishedAt: string | null
  recent: boolean
}

export type SearchPage = {
  hits: SearchHit[]
  totalDocs: number
  totalPages: number
  page: number
}

const collectionsFor = (type: SearchType): SearchCollection[] =>
  indexedCollections.filter(
    (slug) => searchTargets[slug].live && (type === 'all' || searchTargets[slug].type === type),
  )

/** Every word must match some field; a normalized document number also matches by substring. */
function textWhere(q: string): Where {
  const byWords: Where = {
    and: q
      .split(' ')
      .slice(0, MAX_WORDS)
      .map((word) => ({ or: TEXT_FIELDS.map((field) => ({ [field]: { like: word } })) })),
  }
  const key = normalizeIdentifier(q)
  return key.length >= 2 ? { or: [byWords, { identifierKey: { like: key } }] } : byWords
}

/**
 * Public search. Runs under the caller's own (anonymous) access: the search collection's read
 * access limits rows to currently published sources. Throws on failure; never returns an
 * empty page to hide an error.
 */
export async function runSearch(
  payload: Payload,
  params: { q: string; type: SearchType; page: number },
  now: Date = new Date(),
): Promise<SearchPage> {
  const collections = collectionsFor(params.type)
  const q = cleanQueryText(params.q)
  if (collections.length === 0 || !q)
    return { hits: [], totalDocs: 0, totalPages: 0, page: params.page }

  // A row without a slug has no canonical page, so it is neither listed nor counted.
  const where: Where = {
    and: [
      relationIn(collections),
      { slug: { exists: true } },
      { slug: { not_equals: '' } },
      textWhere(q),
    ],
  }
  const result = await payload.find({
    collection: 'search',
    overrideAccess: false,
    draft: false,
    depth: 0,
    limit: PAGE_SIZE,
    page: params.page,
    sort: ['-sortAt', '-id'],
    select: {
      title: true,
      slug: true,
      doc: true,
      identifier: true,
      summary: true,
      publishedAt: true,
    },
    where,
  })

  let { totalDocs, totalPages } = result
  if (result.docs.length === 0 && params.page > 1) {
    // Past the last page the adapter reports no totals; count so the page can link back.
    totalDocs = (await payload.count({ collection: 'search', overrideAccess: false, where }))
      .totalDocs
    totalPages = Math.ceil(totalDocs / PAGE_SIZE)
  }

  const hits: SearchHit[] = []
  for (const row of result.docs) {
    const relationTo = row.doc?.relationTo
    if (!isIndexedCollection(relationTo) || !row.slug) {
      payload.logger.error({ id: row.id }, 'Search row has no canonical target; reindex to repair')
      continue
    }
    hits.push({
      label: searchTargets[relationTo].label,
      title: row.title ?? '',
      href: searchCanonicalPath(relationTo, row.slug),
      identifier: row.identifier ?? null,
      summary: row.summary ?? null,
      publishedAt: row.publishedAt ?? null,
      recent: isRecent(row.publishedAt, now),
    })
  }
  return {
    hits,
    totalDocs,
    totalPages,
    page: result.page ?? params.page,
  }
}
