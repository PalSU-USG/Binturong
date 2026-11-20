import React from 'react'
import { headers } from 'next/headers'
import type { BeforeListTableServerProps } from 'payload'

import { adminCopy } from '@/admin/copy'
import { loadStateCounts, type Source } from '@/admin/dashboard/queries'
import { getPreviewAccount } from '@/utilities/getPreviewAccess'
import './index.scss'

const states = [
  { status: undefined, label: adminCopy.stateAll, key: 'all' },
  { status: 'draft', label: adminCopy.stateNotLive, key: 'draft' },
  { status: 'published', label: adminCopy.stateLive, key: 'published' },
] as const

/** The state filter in the URL, from Next's flat bracket keys or an already-parsed object. */
const currentStatus = (params: BeforeListTableServerProps['searchParams']) => {
  const parsed = (params?.where as { _status?: { equals?: unknown } } | undefined)?._status
  const value = params?.['where[_status][equals]'] ?? parsed?.equals
  return value === 'draft' || value === 'published' ? value : undefined
}

/**
 * "All (n) | Not live yet (n) | Live (n)" above every list that keeps drafts. Counts are read as
 * the signed-in account, never with privileged access; a failed count shows an error, not zero.
 */
export default async function StateLinks({
  collectionSlug,
  payload,
  searchParams,
}: BeforeListTableServerProps) {
  // `user` in server props has field access applied; access checks need the full account.
  const req = await getPreviewAccount(payload, await headers())
  const result = req ? await loadStateCounts(req, collectionSlug as Source) : null
  const current = currentStatus(searchParams)
  const base = `/admin/collections/${collectionSlug}`

  return (
    <nav aria-label={adminCopy.stateNav} className="state-links">
      <ul>
        {states.map(({ status, label, key }) => (
          <li key={key}>
            <a
              aria-current={status === current ? 'page' : undefined}
              href={status ? `${base}?where[_status][equals]=${status}` : base}
            >
              {result?.ok ? `${label} (${result.counts[key]})` : label}
            </a>
          </li>
        ))}
      </ul>
      {!result?.ok && (
        <p className="state-links__error" role="alert">
          {adminCopy.stateCountError}
        </p>
      )}
    </nav>
  )
}
