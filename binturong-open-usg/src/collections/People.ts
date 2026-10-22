import type { CollectionConfig } from 'payload'
import { authenticated } from '@/access/authenticated'
import { deleteDraftContent, readPublishedOrStaff } from '@/access/contentAccess'
import { domainSlug } from '@/fields/domainSlug'
import { protectDomainWrites } from './shared/protectDomainWrites'
import { protectDomainReferences, validateDomainReferences } from './shared/protectDomainReferences'

export const People: CollectionConfig = {
  slug: 'people',
  admin: { useAsTitle: 'name', defaultColumns: ['name', '_status'] },
  access: {
    create: authenticated,
    read: readPublishedOrStaff,
    readVersions: authenticated,
    update: authenticated,
    delete: deleteDraftContent,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'terms',
      type: 'array',
      fields: [
        {
          name: 'office',
          type: 'relationship',
          relationTo: 'offices',
          required: true,
          index: true,
        },
        { name: 'startDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
        { name: 'endDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
        { name: 'academicYear', type: 'relationship', relationTo: 'academic-years', index: true },
      ],
    },
    domainSlug('name'),
  ],
  hooks: {
    beforeOperation: [protectDomainWrites, protectDomainReferences],
    beforeChange: [validateDomainReferences],
  },
  versions: { drafts: { autosave: false, schedulePublish: false }, maxPerDoc: 50 },
}
