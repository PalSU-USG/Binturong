import { adminCopy } from '@/admin/copy'

export type StatusInput = {
  status: unknown
  hasPublishedDoc: boolean
  publishedAt?: string | null
  lastAction?: string | null
}

/** Plain-words state of the document being edited. Anything unrecognised reads as not live. */
export function describeStatus({
  status,
  hasPublishedDoc,
  publishedAt,
  lastAction,
}: StatusInput): string {
  if (status === 'published') {
    const when = publishedAt ? new Date(publishedAt) : null
    return when && !Number.isNaN(when.getTime())
      ? `${adminCopy.statusPublished} since ${when.toLocaleDateString('en-PH', { dateStyle: 'long' })}.`
      : adminCopy.statusPublished
  }
  if (hasPublishedDoc) return adminCopy.statusChanged
  if (lastAction === 'withdraw') return adminCopy.statusWithdrawn
  return adminCopy.statusDraft
}
