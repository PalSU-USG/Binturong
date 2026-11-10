import { setLastEditedBy } from '@/fields/lastEditedBy'
import {
  domainHistory,
  retainDomainAudit,
  domainTransitionComponents,
} from './shared/domainPublicationFields'
import { domainTransitionEndpoints } from './shared/domainTransitionEndpoints'
import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'
import { deleteDraftContent, readPublishedOrStaff } from '@/access/contentAccess'
import { plainFields } from '@/admin/plainFields'
import { protectDomainWrites } from './shared/protectDomainWrites'
import { protectDomainReferences, validateDomainReferences } from './shared/protectDomainReferences'

export const AcademicYears: CollectionConfig = {
  slug: 'academic-years',
  endpoints: domainTransitionEndpoints('academic-years'),
  labels: { singular: 'Academic year', plural: 'Academic years' },
  admin: {
    group: 'Records',
    description: 'School years used to group records.',
    components: domainTransitionComponents,
    useAsTitle: 'label',
    defaultColumns: ['label', 'startDate', 'endDate', '_status'],
  },
  access: {
    create: authenticated,
    read: readPublishedOrStaff,
    readVersions: authenticated,
    update: authenticated,
    delete: deleteDraftContent,
  },
  fields: [
    ...plainFields(
      [
        { name: 'label', type: 'text', required: true },
        { name: 'startDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
        { name: 'endDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
      ],
      {
        label: {
          label: 'Academic year',
          help: 'How the year is written, for example "2026-2027".',
        },
        startDate: { label: 'Starts on', help: 'The first day of the academic year.' },
        endDate: { label: 'Ends on', help: 'The last day of the academic year.' },
      },
    ),
    ...domainHistory('label'),
  ],
  hooks: {
    beforeOperation: [protectDomainWrites, protectDomainReferences],
    beforeChange: [retainDomainAudit, setLastEditedBy, validateDomainReferences],
  },
  versions: { drafts: { autosave: false, schedulePublish: true }, maxPerDoc: 50 },
}
