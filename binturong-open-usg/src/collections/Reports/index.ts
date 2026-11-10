import { setLastEditedBy } from '@/fields/lastEditedBy'
import {
  domainHistory,
  retainDomainAudit,
  domainTransitionComponents,
} from '../shared/domainPublicationFields'
import { domainTransitionEndpoints } from '../shared/domainTransitionEndpoints'
import type { CollectionConfig } from 'payload'
import { authenticated } from '@/access/authenticated'
import { deleteDraftContent, readPublishedOrStaff } from '@/access/contentAccess'
import { plainFields } from '@/admin/plainFields'
import { protectDomainWrites } from '../shared/protectDomainWrites'
import {
  protectDomainReferences,
  validateDomainReferences,
} from '../shared/protectDomainReferences'

export const Reports: CollectionConfig = {
  slug: 'reports',
  endpoints: domainTransitionEndpoints('reports'),
  labels: { singular: 'Report', plural: 'Reports' },
  admin: {
    group: 'Records',
    description: 'Financial and accomplishment reports.',
    components: domainTransitionComponents,
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'reportingPeriod', '_status'],
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
        { name: 'responsibleOffices', type: 'relationship', relationTo: 'offices', hasMany: true },
        { name: 'type', type: 'select', options: ['financial', 'accomplishment'], required: true },
        { name: 'reportingPeriod', type: 'text', required: true },
        { name: 'periodStartDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
        { name: 'periodEndDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
        { name: 'academicYear', type: 'relationship', relationTo: 'academic-years', index: true },
        { name: 'abstract', type: 'richText' },
        { name: 'sourceVersionLabel', type: 'text' },
        {
          name: 'mainDocument',
          type: 'relationship',
          relationTo: 'documents',
          required: true,
          index: true,
        },
        { name: 'attachments', type: 'relationship', relationTo: 'documents', hasMany: true },
        {
          name: 'relatedRecords',
          type: 'relationship',
          relationTo: ['issuances', 'reports', 'posts', 'activities'],
          hasMany: true,
        },
      ],
      {
        title: { label: 'Report title', help: 'For example "Financial Report, First Semester".' },
        organization: { label: 'Organization', help: 'The organization that produced the report.' },
        responsibleOffices: {
          label: 'Responsible offices',
          help: 'Optional. Offices in charge of this report.',
        },
        type: {
          label: 'Kind of report',
          help: 'Choose the closest match.',
          options: { financial: 'Financial report', accomplishment: 'Accomplishment report' },
        },
        reportingPeriod: {
          label: 'Period covered',
          help: 'In words, for example "First Semester 2026-2027".',
        },
        periodStartDate: { label: 'Period starts', help: 'Optional. The first day covered.' },
        periodEndDate: { label: 'Period ends', help: 'Optional. The last day covered.' },
        academicYear: { label: 'Academic year', help: 'Optional. The school year of the report.' },
        abstract: {
          label: 'Short summary',
          help: 'Optional. A few sentences readers will see before opening the report.',
        },
        sourceVersionLabel: {
          label: 'Edition note',
          help: 'Optional. For example "Final" or "As amended".',
        },
        mainDocument: {
          label: 'Report file',
          help: 'The uploaded PDF of the report. Upload it first under Official documents.',
        },
        attachments: {
          label: 'Extra files',
          help: 'Optional. Other uploaded files that belong with the report.',
        },
        relatedRecords: {
          label: 'Related items',
          help: 'Optional. Other issuances, reports, posts or activities readers may want next.',
        },
      },
    ),
    ...domainHistory('title'),
  ],
  hooks: {
    beforeOperation: [protectDomainWrites, protectDomainReferences],
    beforeChange: [retainDomainAudit, setLastEditedBy, validateDomainReferences],
  },
  versions: { drafts: { autosave: false, schedulePublish: true }, maxPerDoc: 0 },
}
