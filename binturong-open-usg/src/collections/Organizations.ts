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

export const Organizations: CollectionConfig = {
  slug: 'organizations',
  endpoints: domainTransitionEndpoints('organizations'),
  labels: { singular: 'Organization', plural: 'Organizations' },
  admin: {
    group: 'People & Offices',
    description: 'Student governments and other organizations that publish records.',
    components: domainTransitionComponents,
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', '_status'],
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
          name: 'kind',
          type: 'select',
          options: ['usg', 'csg', 'university_unit'],
          required: true,
        },
        { name: 'participating', type: 'checkbox', defaultValue: false },
      ],
      {
        name: {
          label: 'Name',
          help: 'The full name of the organization, for example "University Student Government".',
        },
        kind: {
          label: 'Type of organization',
          help: 'Choose the closest match.',
          options: {
            usg: 'University Student Government',
            csg: 'College Student Government',
            university_unit: 'University unit',
          },
        },
        participating: {
          label: 'Participating organization',
          help: 'Tick this if the organization takes part in the student government system.',
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
