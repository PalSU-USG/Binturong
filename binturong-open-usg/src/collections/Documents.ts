import { APIError, type CollectionConfig, type FieldAccess } from 'payload'
import { authenticated } from '@/access/authenticated'
import { documentEndpoints } from '@/storage/documentEndpoints'
import { consumeDocumentWrite } from '@/storage/documentUploads'

const denyFieldAccess: FieldAccess = () => false

const internalOnlyField = {
  access: {
    create: denyFieldAccess,
    read: denyFieldAccess,
    update: denyFieldAccess,
  },
  admin: {
    hidden: true,
    readOnly: true,
  },
} as const

export const Documents: CollectionConfig = {
  slug: 'documents',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'state', 'organization', 'verifiedAt'],
    components: {
      beforeListTable: ['@/components/DocumentUpload'],
    },
  },
  access: { create: () => false, read: authenticated, update: () => false, delete: () => false },
  endpoints: documentEndpoints(),
  fields: [
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      required: true,
      index: true,
    },
    { name: 'title', type: 'text', required: true },
    {
      name: 'state',
      type: 'select',
      options: ['pending', 'ready', 'failed'],
      defaultValue: 'pending',
      required: true,
    },
    { name: 'storageKey', type: 'text', ...internalOnlyField },
    { name: 'originalFilename', type: 'text' },
    { name: 'mimeType', type: 'text' },
    { name: 'size', type: 'number' },
    { name: 'sha256', type: 'text' },
    { name: 'previousVersion', type: 'relationship', relationTo: 'documents', index: true },
    { name: 'uploadActor', type: 'number', index: true, ...internalOnlyField },
    { name: 'uploadRequestId', type: 'text', unique: true, index: true, ...internalOnlyField },
    { name: 'uploadRequestHash', type: 'text', ...internalOnlyField },
    { name: 'stagingKey', type: 'text', ...internalOnlyField },
    { name: 'uploadExpiresAt', type: 'date', ...internalOnlyField },
    {
      name: 'verifiedAt',
      type: 'date',
      access: {
        create: denyFieldAccess,
        update: denyFieldAccess,
      },
      admin: {
        readOnly: true,
      },
    },
  ],
  hooks: {
    beforeOperation: [
      ({ args, operation, req }) => {
        if (!['create', 'update', 'delete', 'restoreVersion'].includes(operation)) return
        const id = 'id' in args ? args.id : undefined
        const data = 'data' in args ? args.data : undefined
        if (consumeDocumentWrite(req, operation, id, data)) return
        throw new APIError(
          'Official document writes are unavailable until private storage is ready',
          403,
        )
      },
    ],
  },
}
