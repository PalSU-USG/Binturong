export type TermInput = {
  name: string
  startDate?: string | null
  endDate?: string | null
  academicYear?: { label: string; startDate?: string | null; endDate?: string | null } | null
}
export type Holder = {
  name: string
  /** The dates used: the term's own, else the academic year's. Null when none were supplied. */
  start: string | null
  end: string | null
  academicYear: string | null
  current: boolean
}

const day = (value: string | null | undefined): number | null => {
  const t = value ? Date.parse(value) : NaN
  return Number.isNaN(t)
    ? null
    : Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate())
}

/**
 * "Current" comes only from supplied dates: the term's own, else its academic year's. A start
 * date alone means "since"; an end date alone means "until" (inclusive of that day). With no usable
 * date a holder is never current. Past terms are kept.
 */
export function resolveHolders(terms: TermInput[], now: Date): Holder[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const holders = terms.map((term): Holder => {
    const own = day(term.startDate) !== null || day(term.endDate) !== null
    const source = own
      ? term
      : (term.academicYear ?? ({} as { startDate?: string | null; endDate?: string | null }))
    const start = day(source.startDate)
    const end = day(source.endDate)
    const supplied = start !== null || end !== null
    return {
      name: term.name,
      start: supplied ? (source.startDate ?? null) : null,
      end: supplied ? (source.endDate ?? null) : null,
      academicYear: term.academicYear?.label ?? null,
      current: supplied && (start === null || start <= today) && (end === null || today <= end),
    }
  })
  return holders.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      (day(b.start) ?? -Infinity) - (day(a.start) ?? -Infinity) ||
      a.name.localeCompare(b.name),
  )
}
