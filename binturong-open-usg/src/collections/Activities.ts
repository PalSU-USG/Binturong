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

export const Activities: CollectionConfig = {
  slug: 'activities',
  endpoints: domainTransitionEndpoints('activities'),
  labels: { singular: 'Activity', plural: 'Activities' },
  admin: {
    group: 'Publish',
    description: 'Events and programs shown on the site.',
    components: domainTransitionComponents,
    useAsTitle: 'title',
    defaultColumns: ['title', 'eventDate', 'organization', '_status'],
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
      ],
      {
        title: {
          label: 'Activity title',
          help: 'What the activity is called, for example "General Assembly".',
        },
        organization: { label: 'Organization', help: 'The organization holding the activity.' },
        academicYear: {
          label: 'Academic year',
          help: 'Optional. The school year the activity belongs to.',
        },
        eventDate: { label: 'Date of the activity', help: 'The day it happens or happened.' },
        time: { label: 'Time', help: 'Optional. For example "2:00 PM to 4:00 PM".' },
        location: { label: 'Place', help: 'Optional. For example "Main Auditorium".' },
        description: {
          label: 'About the activity',
          help: 'Optional. A short description readers will see.',
        },
      },
    ),
    ...domainHistory('title'),
  ],
  hooks: {
    beforeOperation: [protectDomainWrites, protectDomainReferences],
    beforeChange: [retainDomainAudit, setLastEditedBy, validateDomainReferences],
  },
  versions: { drafts: { autosave: false, schedulePublish: true }, maxPerDoc: 50 },
}
