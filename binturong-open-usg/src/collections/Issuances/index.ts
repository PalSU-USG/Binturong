import { setLastEditedBy } from '@/fields/lastEditedBy'
import {
  domainHistory,
  retainDomainAudit,
  domainTransitionComponents,
} from '../shared/domainPublicationFields'
import { domainTransitionEndpoints } from '../shared/domainTransitionEndpoints'
import type { CollectionConfig, NumberFieldValidation, TextFieldSingleValidation } from 'payload'
import { authenticated } from '@/access/authenticated'
import { deleteDraftContent, readPublishedOrStaff } from '@/access/contentAccess'
import { plainFields } from '@/admin/plainFields'
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
  endpoints: domainTransitionEndpoints('issuances'),
  indexes: [{ fields: ['organization', 'type', 'seriesYear', 'normalizedNumber'], unique: true }],
  labels: { singular: 'Issuance', plural: 'Official issuances' },
  admin: {
    group: 'Records',
    description: 'Executive orders, resolutions, memoranda and other issuances.',
    components: domainTransitionComponents,
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
        { name: 'normalizedNumber', type: 'text', admin: { readOnly: true, hidden: true } },
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
      ],
      {
        title: { label: 'Title', help: 'The full title as written on the document.' },
        organization: { label: 'Organization', help: 'The organization that issued it.' },
        issuingOffice: { label: 'Issuing office', help: 'Optional. The office that issued it.' },
        type: {
          label: 'Kind of issuance',
          help: 'Choose the closest match.',
          options: {
            executive_order: 'Executive order',
            memorandum: 'Memorandum',
            act: 'Act',
            resolution: 'Resolution',
            advisory: 'Advisory',
          },
        },
        documentNumber: {
          label: 'Document number',
          help: 'The number printed on the document, for example "12". Advisories may leave this empty.',
        },
        seriesYear: {
          label: 'Series year',
          help: 'The year of the numbering series, for example 2026.',
        },
        issuedDate: { label: 'Date issued', help: 'Optional. The date printed on the document.' },
        effectiveDate: {
          label: 'Takes effect on',
          help: 'Optional. Leave empty if it takes effect when issued.',
        },
        academicYear: {
          label: 'Academic year',
          help: 'Optional. The school year of the issuance.',
        },
        summary: {
          label: 'Short summary',
          help: 'Optional. A few sentences readers will see before opening the file.',
        },
        mainDocument: {
          label: 'Issuance file',
          help: 'The uploaded PDF. Upload it first under Official documents.',
        },
        attachments: {
          label: 'Extra files',
          help: 'Optional. Other uploaded files that belong with it.',
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
    beforeOperation: [protectDomainWrites, protectDomainReferences, validateNumberInput],
    beforeChange: [retainDomainAudit, setLastEditedBy, validateDomainReferences, validateNumber],
  },
  versions: { drafts: { autosave: false, schedulePublish: true }, maxPerDoc: 0 },
}
