import type { Header } from '@/payload-types'
import { resolveLink, type LinkInput } from '@/utilities/resolveLink'

export { resolveLink }

export type NavLink = {
  id: string
  label: string
  /** Null only in review mode, for destinations that are not yet available. */
  href: string | null
  newTab: boolean
  available: boolean
}
export type NavItem = NavLink & {
  section: NonNullable<NonNullable<Header['navItems']>[number]['section']> | null
  children: NavLink[]
}

function toLink(row: { id?: string | null; link?: LinkInput }, index: number, review: boolean) {
  const resolved = resolveLink(row.link)
  if (!resolved && !review) return null
  return {
    id: row.id ?? `row-${index}`,
    label: resolved?.label ?? (row.link?.label?.trim() || 'Untitled'),
    href: resolved?.href ?? null,
    newTab: resolved?.newTab ?? false,
    available: Boolean(resolved),
  } satisfies NavLink
}

/**
 * Builds the public navigation tree from a Header read. Live output contains only available
 * destinations; an unavailable parent removes its group. Review mode keeps unavailable rows.
 */
export function resolveNavigation(
  header: Pick<Header, 'navItems'> | null | undefined,
  { review = false }: { review?: boolean } = {},
): NavItem[] {
  const items: NavItem[] = []
  ;(header?.navItems ?? []).forEach((row, index) => {
    const parent = toLink(row, index, review)
    if (!parent) return
    const children = (row.children ?? []).flatMap((child, childIndex) => {
      const link = toLink(child, childIndex, review)
      return link ? [link] : []
    })
    items.push({ ...parent, section: row.section ?? null, children })
  })
  return items
}
