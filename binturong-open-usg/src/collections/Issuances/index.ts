import type { CollectionConfig, NumberFieldValidation, TextFieldSingleValidation } from 'payload'
import { authenticated } from '@/access/authenticated'
import { deleteDraftContent, readPublishedOrStaff } from '@/access/contentAccess'
import { domainSlug } from '@/fields/domainSlug'
import { protectDomainWrites } from '../shared/protectDomainWrites'
import { validateNumber, validateNumberInput } from './validateNumber'
import {
  protectDomainReferences,
  validateDomainReferences,
} from '../shared/protectDomainReferences'

const isAdvisory = (data: unknown) =>
  !!data && typeof data === 'object' && 'type' in data && data.type === 'advisory'
const hasDocumentNumber = (data: unknown) =>
  !!data &&
  typeof data === 'object' &&
  'documentNumber' in data &&
  typeof data.documentNumber === 'string' &&
  data.documentNumber.trim().length > 0

export const Issuances: CollectionConfig = {
  slug: 'issuances',
  indexes: [{ fields: ['organization', 'type', 'seriesYear', 'normalizedNumber'], unique: true }],
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'documentNumber', 'seriesYear', '_status'],
  },
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
    { name: 'issuingOffice', type: 'relationship', relationTo: 'offices', index: true },
    {
      name: 'type',
      type: 'select',
      options: ['executive_order', 'memorandum', 'act', 'resolution', 'advisory'],
      required: true,
    },
    {
      name: 'documentNumber',
      type: 'text',
      validate: (value: unknown, { siblingData }: Parameters<TextFieldSingleValidation>[1]) =>
        (isAdvisory(siblingData) && (value === undefined || value === null || value === '')) ||
        (typeof value === 'string' && value.trim().length > 0) ||
        'Enter the source document number.',
    },
    {
      name: 'seriesYear',
      type: 'number',
      validate: (value: unknown, { siblingData }: Parameters<NumberFieldValidation>[1]) =>
        (isAdvisory(siblingData) &&
          !hasDocumentNumber(siblingData) &&
          (value === undefined || value === null)) ||
        (typeof value === 'number' && Number.isInteger(value) && value > 0) ||
        'Enter the source series year as a positive integer.',
    },
    { name: 'normalizedNumber', type: 'text', admin: { readOnly: true } },
    { name: 'issuedDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'effectiveDate', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'academicYear', type: 'relationship', relationTo: 'academic-years', index: true },
    { name: 'summary', type: 'richText' },
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
    beforeOperation: [protectDomainWrites, protectDomainReferences, validateNumberInput],
    beforeChange: [validateDomainReferences, validateNumber],
  },
  versions: { drafts: { autosave: false, schedulePublish: false }, maxPerDoc: 0 },
}
