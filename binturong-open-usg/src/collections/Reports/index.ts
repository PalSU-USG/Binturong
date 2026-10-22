import type { CollectionConfig } from 'payload'
import { authenticated } from '@/access/authenticated'
import { deleteDraftContent, readPublishedOrStaff } from '@/access/contentAccess'
import { domainSlug } from '@/fields/domainSlug'
import { protectDomainWrites } from '../shared/protectDomainWrites'
import {
  protectDomainReferences,
  validateDomainReferences,
} from '../shared/protectDomainReferences'

export const Reports: CollectionConfig = {
  slug: 'reports',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'type', 'reportingPeriod', '_status'] },
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
    domainSlug('title'),
  ],
  hooks: {
    beforeOperation: [protectDomainWrites, protectDomainReferences],
    beforeChange: [validateDomainReferences],
  },
  versions: { drafts: { autosave: false, schedulePublish: false }, maxPerDoc: 0 },
}
