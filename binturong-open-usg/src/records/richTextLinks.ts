import type { Payload } from 'payload'

import { safeUrl } from '@/utilities/safeUrl'

/**
 * Record rich text is read at depth 0, so an internal link holds a bare id. The shared RichText
 * renderer throws on that, so links are resolved here: a published target becomes a plain link to
 * its canonical path; anything else (unpublished, missing, unreadable, unsupported, unsafe) becomes
 * its text. Targets are read as an anonymous visitor and never named when hidden.
 */
const targets: Record<string, (slug: string) => string> = {
  posts: (slug) => `/posts/${encodeURIComponent(slug)}`,
  pages: (slug) => `/${encodeURIComponent(slug)}`,
  issuances: (slug) => `/issuances/${encodeURIComponent(slug)}`,
  reports: (slug) => `/reports/${encodeURIComponent(slug)}`,
  activities: (slug) => `/activities/${encodeURIComponent(slug)}`,
}

type Node = {
  type?: string
  children?: Node[]
  fields?: {
    linkType?: string
    url?: string
    doc?: { relationTo?: string; value?: unknown } | null
  }
  [key: string]: unknown
}

const isLink = (node: Node) => node.type === 'link' || node.type === 'autolink'
const idOf = (value: unknown): number | null => {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null
}

function collect(node: Node, refs: Map<string, Set<number>>) {
  if (isLink(node) && node.fields?.linkType === 'internal') {
    const relationTo = node.fields.doc?.relationTo
    const id = idOf(node.fields.doc?.value)
    if (relationTo && id && Object.hasOwn(targets, relationTo))
      (refs.get(relationTo) ?? refs.set(relationTo, new Set()).get(relationTo)!).add(id)
  }
  node.children?.forEach((child) => collect(child, refs))
}

function rewrite(node: Node, paths: Map<string, string>): Node[] {
  const children = node.children?.flatMap((child) => rewrite(child, paths))
  const next = children ? { ...node, children } : node
  if (!isLink(node)) return [next]
  const fields = node.fields ?? {}
  if (fields.linkType === 'internal') {
    const path = paths.get(`${fields.doc?.relationTo}:${idOf(fields.doc?.value)}`)
    return path
      ? [{ ...next, fields: { ...fields, linkType: 'custom', url: path, doc: null } }]
      : (children ?? [])
  }
  return safeUrl(fields.url) ? [next] : (children ?? [])
}

export async function resolveRichTextLinks<T>(
  payload: Payload,
  state: T | null | undefined,
): Promise<T | null> {
  const root = (state as { root?: Node } | null | undefined)?.root
  if (!root) return null
  const refs = new Map<string, Set<number>>()
  collect(root, refs)
  const paths = new Map<string, string>()
  for (const [relationTo, ids] of refs) {
    const { docs } = await payload.find({
      collection: relationTo as 'posts',
      overrideAccess: false,
      draft: false,
      depth: 0,
      pagination: false,
      select: { slug: true },
      where: { and: [{ id: { in: [...ids] } }, { _status: { equals: 'published' } }] },
    })
    for (const doc of docs as { id: number; slug?: string | null }[])
      if (typeof doc.slug === 'string' && doc.slug)
        paths.set(`${relationTo}:${doc.id}`, targets[relationTo]!(doc.slug))
  }
  const [rewritten] = rewrite(root, paths)
  return { ...(state as object), root: rewritten } as T
}
