import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'
import { deleteDraftContent, readPublishedOrStaff } from '@/access/contentAccess'
import { domainSlug } from '@/fields/domainSlug'
import { protectDomainWrites } from './shared/protectDomainWrites'
import { protectDomainReferences, validateDomainReferences } from './shared/protectDomainReferences'

export const AcademicYears: CollectionConfig = {
  slug: 'academic-years',
  admin: { useAsTitle: 'label', defaultColumns: ['label', 'startDate', 'endDate', '_status'] },
  access: {
    create: authenticated,
    read: readPublishedOrStaff,
    readVersions: authenticated,
    update: authenticated,
    delete: deleteDraftContent,
  },
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'startDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'endDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    domainSlug('label'),
  ],
  hooks: {
    beforeOperation: [protectDomainWrites, protectDomainReferences],
    beforeChange: [validateDomainReferences],
  },
  versions: { drafts: { autosave: false, schedulePublish: false }, maxPerDoc: 50 },
}
