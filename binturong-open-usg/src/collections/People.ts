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

export const People: CollectionConfig = {
  slug: 'people',
  endpoints: domainTransitionEndpoints('people'),
  labels: { singular: 'Person', plural: 'People' },
  admin: {
    group: 'People & Offices',
    description: 'Officials and members shown on the site.',
    components: domainTransitionComponents,
    useAsTitle: 'name',
    defaultColumns: ['name', '_status'],
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
            {
              name: 'academicYear',
              type: 'relationship',
              relationTo: 'academic-years',
              index: true,
            },
          ],
        },
      ],
      {
        name: { label: 'Full name', help: 'The name as it should appear on the site.' },
        terms: {
          label: 'Positions held',
          help: 'Each time this person held an office. Add one row per position.',
        },
        'terms.office': { label: 'Office', help: 'The office held.' },
        'terms.startDate': {
          label: 'Started on',
          help: 'Optional. The first day in this position.',
        },
        'terms.endDate': {
          label: 'Ended on',
          help: 'Optional. Leave empty if the person still holds it.',
        },
        'terms.academicYear': {
          label: 'Academic year',
          help: 'Optional. The school year of this position.',
        },
      },
    ),
    ...domainHistory('name'),
  ],
  hooks: {
    beforeOperation: [protectDomainWrites, protectDomainReferences],
    beforeChange: [retainDomainAudit, setLastEditedBy, validateDomainReferences],
  },
  versions: { drafts: { autosave: false, schedulePublish: true }, maxPerDoc: 50 },
}
