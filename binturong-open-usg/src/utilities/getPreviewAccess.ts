import { createLocalReq, type Payload } from 'payload'
import { draftMode, headers } from 'next/headers'

import { getActiveAccount } from '@/access/activeAccount'

export async function getPreviewAccount(payload: Payload, requestHeaders: Headers) {
  const { user } = await payload.auth({ headers: requestHeaders })
  if (!user) return null
  const req = await createLocalReq({ user }, payload)
  return (await getActiveAccount(req)) ? req : null
}

export async function getPreviewAccess(payload: Payload) {
  if (!(await draftMode()).isEnabled) return { draft: false }
  const req = await getPreviewAccount(payload, await headers())
  return req ? { draft: true, req } : { draft: false }
}
