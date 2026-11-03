import { APIError, type CollectionConfig } from 'payload'
import { authenticated } from '@/access/authenticated'

export const Documents: CollectionConfig = {
  slug: 'documents',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'state', 'organization'] },
  access: { create: () => false, read: authenticated, update: () => false, delete: () => false },
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
    { name: 'storageKey', type: 'text' },
    { name: 'originalFilename', type: 'text' },
    { name: 'mimeType', type: 'text' },
    { name: 'size', type: 'number' },
    { name: 'sha256', type: 'text' },
    { name: 'previousVersion', type: 'relationship', relationTo: 'documents', index: true },
  ],
  hooks: {
    beforeOperation: [
      ({ operation }) => {
        if (['create', 'update', 'delete', 'restoreVersion'].includes(operation))
          throw new APIError(
            'Official document writes are unavailable until private storage is ready',
            403,
          )
      },
    ],
  },
}
