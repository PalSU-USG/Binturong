import type { CollectionConfig } from 'payload'
import { authenticated } from '@/access/authenticated'
import { deleteDraftContent, readPublishedOrStaff } from '@/access/contentAccess'
import { domainSlug } from '@/fields/domainSlug'
import { protectDomainWrites } from './shared/protectDomainWrites'
import { protectDomainReferences, validateDomainReferences } from './shared/protectDomainReferences'

export const Activities: CollectionConfig = {
  slug: 'activities',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'eventDate', 'organization', '_status'] },
  access: {
    create: authenticated,
    read: readPublishedOrStaff,
    readVersions: authenticated,
    update: authenticated,
    delete: deleteDraftContent,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      required: true,
      index: true,
    },
    { name: 'academicYear', type: 'relationship', relationTo: 'academic-years', index: true },
    {
      name: 'eventDate',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    { name: 'time', type: 'text' },
    { name: 'location', type: 'text' },
    { name: 'description', type: 'richText' },
    domainSlug('title'),
  ],
  hooks: {
    beforeOperation: [protectDomainWrites, protectDomainReferences],
    beforeChange: [validateDomainReferences],
  },
  versions: { drafts: { autosave: false, schedulePublish: false }, maxPerDoc: 50 },
}
