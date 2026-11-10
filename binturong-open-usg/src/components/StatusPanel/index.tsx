'use client'

import React from 'react'
import { useAuth, useDocumentInfo } from '@payloadcms/ui'

import { adminCopy } from '@/admin/copy'
import { hasRole } from '@/access/roles'
import { describeStatus } from './statusText'
import './index.scss'

/**
 * Says in plain words whether the item is live and what happens next. Presentation only:
 * what a person may do is decided by the server, not by this text.
 */
export default function StatusPanel() {
  const { data, hasPublishedDoc } = useDocumentInfo()
  const { user } = useAuth()
  const canPublish = hasRole(user?.role, 'publisher')
  const lastTransition = data?.lastTransition as { action?: string } | undefined
  return (
    <section className="status-panel" aria-label="Where this stands">
      <p className="status-panel__state">
        <strong>
          {describeStatus({
            status: data?._status,
            hasPublishedDoc: Boolean(hasPublishedDoc),
            publishedAt: typeof data?.publishedAt === 'string' ? data.publishedAt : null,
            lastAction: lastTransition?.action ?? null,
          })}
        </strong>{' '}
        {canPublish ? adminCopy.rolePublisher : adminCopy.roleEditor}
      </p>
      <details className="status-panel__steps">
        <summary>{adminCopy.stepsTitle}</summary>
        <ol>
          <li>{adminCopy.step1}</li>
          <li>{adminCopy.step2}</li>
          <li>{adminCopy.step3}</li>
        </ol>
      </details>
    </section>
  )
}
