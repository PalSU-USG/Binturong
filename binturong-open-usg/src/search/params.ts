export type SearchType = 'all' | 'updates' | 'issuances' | 'reports'
export type SearchParams = { q: string | null; type: SearchType; page: number }
type RawValue = string | string[] | undefined

const TYPES: readonly SearchType[] = ['all', 'updates', 'issuances', 'reports']
const MAX_QUERY_LENGTH = 100
const MIN_QUERY_LENGTH = 2
const MAX_PAGE = 10_000

const first = (value: RawValue): string | undefined => (Array.isArray(value) ? value[0] : value)

/** Applies the public-search URL rules; never throws. A null `q` means "show the prompt". */
export function parseSearchParams(raw: {
  q?: RawValue
  type?: RawValue
  page?: RawValue
}): SearchParams {
  const text = (first(raw.q) ?? '')
    .normalize('NFC')
    .replace(/[%_\\]/g, '')
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .trim()
  const q = Array.from(text).slice(0, MAX_QUERY_LENGTH).join('').trim()

  const type = TYPES.find((candidate) => candidate === first(raw.type)) ?? 'all'

  const pageText = first(raw.page)
  const page = pageText !== undefined && /^[1-9]\d{0,8}$/.test(pageText) ? Number(pageText) : 1

  return {
    q: Array.from(q).length >= MIN_QUERY_LENGTH ? q : null,
    type,
    page: page <= MAX_PAGE ? page : 1,
  }
}

/** True when `publishedAt` is within `days` before `now`. Pure; the flag is never stored. */
export function isRecent(
  publishedAt: string | Date | null | undefined,
  now: Date,
  days = 30,
): boolean {
  if (!publishedAt) return false
  const age = now.getTime() - new Date(publishedAt).getTime()
  return Number.isFinite(age) && age >= 0 && age <= days * 86_400_000
}
