import { APIError, type CollectionBeforeOperationHook } from 'payload'

import { enforceEditorialWrites } from '@/hooks/enforceEditorialWrites'
import { consumeDomainTransition } from './transitionDomainRecord'

export const protectDomainWrites: CollectionBeforeOperationHook = async (operationArgs) => {
  const { args, operation, req } = operationArgs
  if (!['create', 'update', 'delete', 'restoreVersion'].includes(operation)) return

  await enforceEditorialWrites({ ...operationArgs, overrideAccess: false })

  if (operation === 'delete') {
    const id = 'id' in args ? args.id : undefined
    if (typeof id !== 'number' && typeof id !== 'string')
      throw new APIError('Delete one draft at a time', 403)
    const current = await req.payload.findByID({
      collection: args.collection.config.slug,
      id,
      draft: false,
      depth: 0,
      overrideAccess: false,
      req,
    })
    if (
      !('_status' in current) ||
      current._status !== 'draft' ||
      ('publishedAt' in current && current.publishedAt)
    )
      throw new APIError('Only draft records may be deleted', 403)
    return
  }

  const data = 'data' in args ? args.data : undefined
  if (
    operation === 'update' &&
    'id' in args &&
    consumeDomainTransition(req, args.collection.config.slug, args.id, data)
  )
    return
  if (
    operation === 'restoreVersion' ||
    !('draft' in args) ||
    args.draft !== true ||
    (operation === 'update' && (!('id' in args) || !args.id)) ||
    ('autosave' in args && args.autosave) ||
    ('publishAllLocales' in args && args.publishAllLocales) ||
    ('unpublishAllLocales' in args && args.unpublishAllLocales) ||
    (data && '_status' in data && data._status !== undefined && data._status !== 'draft')
  )
    throw new APIError('Save one draft at a time. Use review to publish, withdraw or restore.', 403)

  if (data && ['publishedAt', 'lastTransition'].some((field) => Object.hasOwn(data, field)))
    throw new APIError('Publication audit fields are controlled by the server', 403)
}
