import type { CollectionBeforeChangeHook, CollectionConfig, Field, FieldAccess } from 'payload'
import { getActiveAccount } from '@/access/activeAccount'
import { domainSlug } from '@/fields/domainSlug'
import { lastEditedByField } from '@/fields/lastEditedBy'
import { hasDomainTransition } from './transitionDomainRecord'

const staff: FieldAccess = async ({ req }) => Boolean(await getActiveAccount(req))
export const domainTransitionComponents: NonNullable<CollectionConfig['admin']>['components'] = {
  edit: {
    PublishButton: '@/components/DomainTransitions#NativeTransitionButton',
    UnpublishButton: '@/components/DomainTransitions#NativeTransitionButton',
    beforeDocumentControls: ['@/components/StatusPanel', '@/components/DomainTransitions'],
  },
}
export const domainPublicationFields: Field[] = [
  lastEditedByField,
  {
    name: 'publishedAt',
    type: 'date',
    label: 'First published',
    admin: {
      description: 'Set by the site when a publisher first makes this live. It cannot be edited.',
      readOnly: true,
      components: { Field: '@/components/DomainTransitions#ProtectedAuditField' },
    },
  },
  {
    name: 'lastTransition',
    type: 'group',
    label: 'Last change of status',
    admin: {
      description: 'Records the latest publication, withdrawal or restore. It cannot be edited.',
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

/**
 * Rarely needed fields, placed last in the form. The audit fields stay outside the collapsed
 * section on purpose: their component marks them as server-controlled when it mounts, and a
 * collapsed section does not mount its children, so the form would submit them.
 */
export const domainHistory = (useAsSlug: 'name' | 'label' | 'title'): Field[] => {
  const [lastEditedBy, ...audit] = domainPublicationFields
  return [
    ...audit,
    {
      type: 'collapsible',
      label: 'History and advanced',
      admin: { initCollapsed: true },
      fields: [lastEditedBy, domainSlug(useAsSlug)],
    },
  ]
}

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
