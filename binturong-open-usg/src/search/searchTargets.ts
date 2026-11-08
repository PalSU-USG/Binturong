import type { SearchType } from './params'

type SearchTarget = {
  label: string
  type: Exclude<SearchType, 'all'>
  path: (slug: string) => string
  /** The detail route exists. Non-live targets are indexed but never listed. */
  live: boolean
}

const target = (
  label: string,
  type: SearchTarget['type'],
  base: string,
  live: boolean,
): SearchTarget => ({ label, type, live, path: (slug) => `${base}/${encodeURIComponent(slug)}` })

export const searchTargets = {
  posts: target('Update', 'updates', '/posts', true),
  issuances: target('Issuance', 'issuances', '/issuances', false),
  reports: target('Report', 'reports', '/reports', false),
} as const satisfies Record<string, SearchTarget>

export type SearchCollection = keyof typeof searchTargets

export const indexedCollections = Object.keys(searchTargets) as SearchCollection[]
export const liveCollections = indexedCollections.filter((slug) => searchTargets[slug].live)

export const isIndexedCollection = (value: unknown): value is SearchCollection =>
  typeof value === 'string' && Object.hasOwn(searchTargets, value)

/** The only place a search link is built. Throws for an unregistered collection or empty slug. */
export function searchCanonicalPath(relationTo: string, slug: string): string {
  if (!isIndexedCollection(relationTo))
    throw new Error(`Collection is not searchable: ${relationTo}`)
  if (typeof slug !== 'string' || slug.length === 0) throw new Error('A search result needs a slug')
  return searchTargets[relationTo].path(slug)
}
