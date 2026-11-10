'use client'

import React from 'react'
import { PublishButton, UnpublishButton, useAuth } from '@payloadcms/ui'

import { adminCopy } from '@/admin/copy'
import { hasRole } from '@/access/roles'

/**
 * Editors only save drafts, so the stock publish and unpublish controls (including
 * scheduling) are replaced by one sentence. This is cosmetic: the server refuses an
 * editor's publish, unpublish and schedule requests whatever this component renders.
 */
export function RolePublishButton() {
  const { user } = useAuth()
  if (hasRole(user?.role, 'publisher')) return <PublishButton />
  return <p className="status-panel__note">{adminCopy.saveDraftOnly}</p>
}

export function RoleUnpublishButton() {
  const { user } = useAuth()
  return hasRole(user?.role, 'publisher') ? <UnpublishButton /> : null
}
