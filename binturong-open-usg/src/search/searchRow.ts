import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

import { normalizeIdentifier } from './identifier'
import type { SearchCollection } from './searchTargets'

export const SUMMARY_LIMIT = 300

/** Fields read from a published source record to build or verify its row. Nothing else is read. */
export const sourceSelect: Record<SearchCollection, Record<string, true>> = {
  posts: {
    title: true,
    slug: true,
    meta: true,
    categories: true,
    publishedAt: true,
    createdAt: true,
  },
  issuances: {
    title: true,
    slug: true,
    documentNumber: true,
    summary: true,
    publishedAt: true,
    createdAt: true,
  },
  reports: {
    title: true,
    slug: true,
    reportingPeriod: true,
    abstract: true,
    publishedAt: true,
    createdAt: true,
  },
}

type SourceDoc = Record<string, unknown>

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

export function plainSummary(richText: unknown): string | null {
  if (!richText || typeof richText !== 'object' || !('root' in richText)) return null
  const plain = convertLexicalToPlaintext({ data: richText as SerializedEditorState })
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return null
  // The stored field validates UTF-16 length, so cap by code units without splitting a pair.
  let out = ''
  for (const char of plain) {
    if (out.length + char.length > SUMMARY_LIMIT) break
    out += char
  }
  return out
}

/**
 * The allowlisted, derived row fields for one published source record. The source document
 * is never spread into the row: no Document references, files, audit or related records.
 */
export function searchRowFields(collection: SearchCollection, source: object) {
  const doc = source as SourceDoc
  const identifier =
    collection === 'issuances'
      ? text(doc.documentNumber)
      : collection === 'reports'
        ? text(doc.reportingPeriod)
        : null
  const richSummary =
    collection === 'issuances' ? doc.summary : collection === 'reports' ? doc.abstract : null
  const publishedAt = text(doc.publishedAt)
  return {
    title: text(doc.title) ?? '',
    slug: text(doc.slug) ?? undefined,
    identifier,
    identifierKey: normalizeIdentifier(identifier) || null,
    summary: plainSummary(richSummary),
    publishedAt,
    sortAt: publishedAt ?? text(doc.createdAt) ?? new Date(0).toISOString(),
  }
}
