// Reviewed record-type prefixes. Keys are already normalized (lowercase letters and
// digits only). Applied to the start of an identifier only; extend with tests.
const PREFIX_ALIASES: ReadonlyArray<readonly [prefix: string, canonical: string]> = [
  ['executiveorder', 'eo'],
  ['resolution', 'res'],
  ['memorandum', 'memo'],
]

/**
 * Comparison form of a document number: case, spacing and punctuation are ignored and
 * a reviewed prefix alias list maps to one canonical form. Used for matching only; the
 * entered identifier is stored and displayed unchanged. Returns '' when nothing remains.
 */
export function normalizeIdentifier(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  const key = value
    .normalize('NFC')
    .replace(/<[^>]*>/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
  for (const [prefix, canonical] of PREFIX_ALIASES)
    if (key.startsWith(prefix)) return canonical + key.slice(prefix.length)
  return key
}
