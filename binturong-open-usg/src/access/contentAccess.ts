import type { Access } from 'payload'

import { getActiveAccount } from './activeAccount'
import { hasRole } from './roles'

export const editContent: Access = async ({ req, data }) => {
  const actor = await getActiveAccount(req)
  return !!actor && (data?._status !== 'published' || hasRole(actor.role, 'publisher'))
}

export const publishContent: Access = async ({ req }) =>
  hasRole((await getActiveAccount(req))?.role, 'publisher')

export const readPublishedOrStaff: Access = async ({ req }) => {
  if (await getActiveAccount(req)) return true
  if (req.user) return false
  return { _status: { equals: 'published' } }
}

export const deleteDraftContent: Access = async ({ req }) =>
  (await publishContent({ req })) ? { _status: { equals: 'draft' } } : false
