import {
  ValidationError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
  type PayloadRequest,
} from 'payload'
import { hasDomainKey } from '../shared/hasDomainKey'
import { normalizeDocumentNumber } from './normalizeDocumentNumber'

function invalid(req: PayloadRequest, path: string, message: string): never {
  throw new ValidationError({ collection: 'issuances', req, errors: [{ path, message }] })
}

export const validateNumberInput: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (!['create', 'update'].includes(operation) || !('data' in args)) return
  const data = args.data
  if (!data) return
  if (
    'documentNumber' in data &&
    data.documentNumber != null &&
    typeof data.documentNumber !== 'string'
  )
    invalid(req, 'documentNumber', 'Enter a source document number as text.')
  if (
    'seriesYear' in data &&
    data.seriesYear != null &&
    (typeof data.seriesYear !== 'number' ||
      !Number.isInteger(data.seriesYear) ||
      data.seriesYear <= 0)
  )
    invalid(req, 'seriesYear', 'Enter the source series year as a positive integer.')
}

export const validateNumber: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  data.normalizedNumber =
    typeof data.documentNumber === 'string'
      ? normalizeDocumentNumber(data.documentNumber) || null
      : null
  if (
    data.organization &&
    data.type &&
    data.seriesYear != null &&
    data.normalizedNumber &&
    (await hasDomainKey(
      req,
      'issuances',
      {
        organization: { equals: data.organization },
        type: { equals: data.type },
        seriesYear: { equals: data.seriesYear },
        normalizedNumber: { equals: data.normalizedNumber },
      },
      originalDoc?.id,
    ))
  )
    invalid(
      req,
      'documentNumber',
      'This number is reserved by another record or its latest draft for this organization, type and year.',
    )
  return data
}
