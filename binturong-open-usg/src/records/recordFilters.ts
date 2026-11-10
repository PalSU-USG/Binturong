export const RECORD_PAGE_SIZE = 12
/** Browsing depth limit; visitors narrow with filters (or Search) beyond it. */
export const MAX_PAGE = 50

export type RecordScope =
  'archives' | 'executive' | 'legislative' | 'judicial' | 'csg' | 'financial' | 'accomplishment'

export const issuanceTypes = [
  { value: 'executive_order', label: 'Executive order' },
  { value: 'memorandum', label: 'Memorandum' },
  { value: 'act', label: 'Act' },
  { value: 'resolution', label: 'Resolution' },
  { value: 'advisory', label: 'Advisory' },
] as const

export type RecordFilters = {
  page: number
  /** Academic year slug as supplied; resolved (or rejected) when the list is read. */
  year: string | null
  /** Issuance type value. Always null on transparency pages. */
  type: string | null
  /** Participating CSG slug; only used by the `csg` scope. */
  csg: string | null
  notices: string[]
}

type Params = Record<string, string | string[] | undefined>
const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() || undefined
const slugValue = (value: string | undefined) => (value && value.length <= 200 ? value : null)

/** Reads untrusted query parameters. Never throws; anything it ignores is reported in `notices`. */
export function parseRecordFilters(params: Params, scope: RecordScope): RecordFilters {
  const notices: string[] = []
  let page = 1
  const rawPage = first(params.page)
  if (rawPage !== undefined) {
    if (/^[1-9]\d{0,8}$/.test(rawPage)) {
      page = Math.min(Number(rawPage), MAX_PAGE)
      if (Number(rawPage) > MAX_PAGE)
        notices.push(
          `Only the first ${MAX_PAGE} pages can be browsed. Use the filters to narrow the list.`,
        )
    } else notices.push('That page number is not valid; showing page 1.')
  }

  let type: string | null = null
  const rawType = first(params.type)
  const fixedType = scope === 'financial' || scope === 'accomplishment'
  if (rawType && !fixedType) {
    if (issuanceTypes.some((t) => t.value === rawType)) type = rawType
    else notices.push('That record type was not recognised; showing all types.')
  }

  return {
    page,
    year: slugValue(first(params.year)) ?? null,
    type,
    csg: scope === 'csg' ? slugValue(first(params.csg)) : null,
    notices,
  }
}
