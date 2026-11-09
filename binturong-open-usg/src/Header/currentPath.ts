export type PathMatch = 'page' | 'section' | null

function normalize(path: string): string | null {
  if (!path.startsWith('/') || path.startsWith('//')) return null
  const [bare] = path.split(/[?#]/)
  let decoded = bare
  try {
    decoded = decodeURI(bare)
  } catch {
    // Keep the raw path when it is not valid percent-encoding.
  }
  return decoded.length > 1 ? decoded.replace(/\/+$/, '') || '/' : decoded
}

/**
 * Compares a link with the current path at segment boundaries, ignoring query and hash.
 * Home only matches home and external links never match.
 */
export function matchPath(href: string | null, pathname: string | null | undefined): PathMatch {
  const target = href ? normalize(href) : null
  const current = pathname ? normalize(pathname) : null
  if (!target || !current) return null
  if (target === current) return 'page'
  return target !== '/' && current.startsWith(`${target}/`) ? 'section' : null
}
