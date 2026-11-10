/**
 * Words that must never appear in text an editor reads (labels, help text, status and
 * dashboard copy). Matched case-insensitively as whole words. Keep in step with
 * docs/superpowers/specs/2026-11-09-admin-usability-design.md.
 */
export const bannedTerms = [
  'slug',
  'collection',
  'collections',
  'global',
  'globals',
  'relationship',
  'json',
  'payload',
  'endpoint',
  'schema',
  'api',
  'version',
  'versions',
  'draft status',
  '_status',
  'lastTransition',
  'publishedAt',
  'normalizedNumber',
] as const

export function findBannedTerms(text: string): string[] {
  const lower = text.toLowerCase()
  return bannedTerms.filter((term) => {
    const needle = term.toLowerCase()
    let from = 0
    for (;;) {
      const at = lower.indexOf(needle, from)
      if (at < 0) return false
      const before = lower[at - 1]
      const after = lower[at + needle.length]
      if (!/[a-z0-9_]/.test(before ?? '') && !/[a-z0-9_]/.test(after ?? '')) return true
      from = at + 1
    }
  })
}
