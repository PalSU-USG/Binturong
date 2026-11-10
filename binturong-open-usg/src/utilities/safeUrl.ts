const allowedProtocols = new Set(['https:', 'http:', 'mailto:', 'tel:'])

/**
 * Returns the trimmed URL when it is a site-relative path or an https/http/mailto/tel URL.
 * Everything else (script/data schemes, protocol-relative, bare fragments) is rejected.
 */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = value.trim()
  if (!url || /[\u0000-\u001f\u007f\\]/.test(url)) return null
  if (url.startsWith('/')) return url.startsWith('//') ? null : url
  try {
    return allowedProtocols.has(new URL(url).protocol) ? url : null
  } catch {
    return null
  }
}
