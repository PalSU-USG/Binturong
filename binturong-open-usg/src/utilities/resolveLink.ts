import type { Page, Post } from '@/payload-types'
import { safeUrl } from '@/utilities/safeUrl'

export type LinkInput = {
  type?: 'custom' | 'reference' | null
  label?: string | null
  url?: string | null
  newTab?: boolean | null
  reference?: {
    relationTo: 'pages' | 'posts'
    value: Page | Post | string | number
  } | null
}

export type ResolvedLink = { href: string; label: string; newTab: boolean }

/**
 * Selects exactly one branch. A reference never falls back to the stored custom URL, and
 * only a populated, non-draft target with a slug yields a destination.
 */
export function resolveHref(link: LinkInput | null | undefined): string | null {
  if (!link) return null
  if (link.type !== 'reference') return safeUrl(link.url)
  const target = link.reference?.value
  if (!target || typeof target !== 'object') return null
  if (target._status && target._status !== 'published') return null
  if (typeof target.slug !== 'string' || !target.slug) return null
  return safeUrl(`${link.reference?.relationTo === 'posts' ? '/posts' : ''}/${target.slug}`)
}

export function resolveLink(link: LinkInput | null | undefined): ResolvedLink | null {
  const href = resolveHref(link)
  const label = link?.label?.trim()
  return href && label ? { href, label, newTab: Boolean(link?.newTab) } : null
}
