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

export const Offices: CollectionConfig = {
  slug: 'offices',
  endpoints: domainTransitionEndpoints('offices'),
  labels: { singular: 'Office', plural: 'Offices' },
  admin: {
    group: 'People & Offices',
    description: 'Offices and bodies of the student government.',
    components: domainTransitionComponents,
    useAsTitle: 'name',
    defaultColumns: ['name', 'organization', '_status'],
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
          name: 'organization',
          type: 'relationship',
          relationTo: 'organizations',
          required: true,
          index: true,
        },
        { name: 'parent', type: 'relationship', relationTo: 'offices', index: true },
        { name: 'branch', type: 'select', options: ['executive', 'legislative', 'judicial'] },
      ],
      {
        name: { label: 'Office name', help: 'For example "Office of the President".' },
        organization: { label: 'Organization', help: 'The organization this office belongs to.' },
        parent: {
          label: 'Part of office',
          help: 'Optional. Choose the larger office this one reports to.',
        },
        branch: {
          label: 'Branch',
          help: 'Optional. The branch of government this office belongs to.',
          options: { executive: 'Executive', legislative: 'Legislative', judicial: 'Judicial' },
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
