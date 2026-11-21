/**
 * "Memorandum No. 023, s. 2026-2027": how USG cites a numbered record. The series is the linked
 * academic year's label as written (owner decision G9, 21 Nov 2026), not `seriesYear`.
 */
export function citation({
  typeLabel,
  documentNumber,
  seriesLabel,
}: {
  typeLabel: string
  documentNumber: string | null | undefined
  seriesLabel: string | null | undefined
}): string | null {
  const number = documentNumber?.trim()
  const series = seriesLabel?.trim()
  if (!number || !series) return null
  const label = /^no\.\s+/i.test(number)
    ? `${typeLabel} ${number}`
    : /\bno\.\s+/i.test(number)
      ? number
      : `${typeLabel} No. ${number}`
  return `${label}, s. ${series}`
}
