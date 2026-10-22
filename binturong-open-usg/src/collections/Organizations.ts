import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'
import { deleteDraftContent, readPublishedOrStaff } from '@/access/contentAccess'
import { domainSlug } from '@/fields/domainSlug'
import { protectDomainWrites } from './shared/protectDomainWrites'
import { protectDomainReferences, validateDomainReferences } from './shared/protectDomainReferences'

export const Organizations: CollectionConfig = {
  slug: 'organizations',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'kind', '_status'] },
  access: {
    create: authenticated,
    read: readPublishedOrStaff,
    readVersions: authenticated,
    update: authenticated,
    delete: deleteDraftContent,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'kind', type: 'select', options: ['usg', 'csg', 'university_unit'], required: true },
    { name: 'participating', type: 'checkbox', defaultValue: false },
    domainSlug('name'),
  ],
  hooks: {
    beforeOperation: [protectDomainWrites, protectDomainReferences],
    beforeChange: [validateDomainReferences],
  },
  versions: { drafts: { autosave: false, schedulePublish: false }, maxPerDoc: 50 },
}
