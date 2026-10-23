import type { CollectionBeforeChangeHook, CollectionConfig, Field, FieldAccess } from 'payload'
import { getActiveAccount } from '@/access/activeAccount'
import { hasDomainTransition } from './transitionDomainRecord'

const staff: FieldAccess = async ({ req }) => Boolean(await getActiveAccount(req))
export const domainTransitionComponents: NonNullable<CollectionConfig['admin']>['components'] = {
  edit: {
    PublishButton: '@/components/DomainTransitions#NativeTransitionButton',
    UnpublishButton: '@/components/DomainTransitions#NativeTransitionButton',
    beforeDocumentControls: ['@/components/DomainTransitions'],
  },
}
export const domainPublicationFields: Field[] = [
  {
    name: 'publishedAt',
    type: 'date',
    admin: {
      readOnly: true,
      components: { Field: '@/components/DomainTransitions#ProtectedAuditField' },
    },
  },
  {
    name: 'lastTransition',
    type: 'group',
    admin: {
      readOnly: true,
      components: { Field: '@/components/DomainTransitions#ProtectedAuditField' },
    },
    access: { read: staff },
    fields: [
      { name: 'action', type: 'select', options: ['publish', 'withdraw', 'restore'] },
      { name: 'actorID', type: 'number' },
      { name: 'at', type: 'date' },
      { name: 'reviewedVersionID', type: 'number' },
      { name: 'reviewedVersionHash', type: 'text' },
      { name: 'expectedVersionID', type: 'number' },
      { name: 'expectedVersionHash', type: 'text' },
    ],
  },
]

export const retainDomainAudit: CollectionBeforeChangeHook = async ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  if (!originalDoc?.id || hasDomainTransition(req)) return data
  const canonical = await req.payload.db.findOne<{
    id: number
    publishedAt?: string
    lastTransition?: unknown
  }>({
    collection: collection.slug,
    where: { id: { equals: originalDoc.id } },
    select: { publishedAt: true, lastTransition: true },
    req,
  })
  return {
    ...data,
    publishedAt: canonical?.publishedAt ?? null,
    lastTransition: canonical?.lastTransition ?? null,
  }
}
