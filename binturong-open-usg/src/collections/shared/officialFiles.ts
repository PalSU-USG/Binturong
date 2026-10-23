import { ValidationError, type PayloadRequest, type Validate } from 'payload'

import { validateDomainReferences } from './protectDomainReferences'
import type { DomainCollection } from './domainCollections'

export async function requireOfficialFiles(
  req: PayloadRequest,
  candidate: { mainDocument?: unknown; attachments?: unknown },
): Promise<never> {
  throw new ValidationError({
    req,
    errors: [
      'mainDocument',
      ...(Array.isArray(candidate.attachments) && candidate.attachments.length
        ? ['attachments']
        : []),
    ].map((path) => ({ path, message: 'Private document storage is not available yet.' })),
  })
}

export async function validateOfficialCandidate(
  req: PayloadRequest,
  collectionSlug: 'issuances' | 'reports',
  data: Record<string, unknown>,
): Promise<never> {
  await validateSavedCandidateFields(req, collectionSlug, data)
  const collection = req.payload.collections[collectionSlug].config
  await validateDomainReferences({
    collection,
    data,
    originalDoc: data,
    operation: 'update',
    context: req.context,
    req,
  })
  return requireOfficialFiles(req, data)
}

export async function validateSavedCandidateFields(
  req: PayloadRequest,
  collectionSlug: DomainCollection,
  data: Record<string, unknown>,
): Promise<void> {
  const collection = req.payload.collections[collectionSlug].config
  const errors: { path: string; message: string }[] = []
  // Reuse sanitized schema validators without rerunning field hooks or saving a revision.
  for (const field of collection.flattenedFields) {
    if (!('name' in field) || !('validate' in field) || !field.validate) continue
    const value = data[field.name]
    if (value !== undefined && value !== null) {
      const badShape =
        (['text', 'textarea', 'date', 'select'].includes(field.type) &&
          typeof value !== 'string') ||
        (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) ||
        (field.type === 'checkbox' && typeof value !== 'boolean') ||
        (field.type === 'relationship' && field.hasMany && !Array.isArray(value)) ||
        (field.type === 'richText' && (typeof value !== 'object' || Array.isArray(value)))
      if (
        badShape ||
        (field.type === 'text' && field.required && (typeof value !== 'string' || !value.trim()))
      ) {
        errors.push({ path: field.name, message: 'Enter a valid, nonblank value.' })
        continue
      }
    }
    const validate = field.validate as Validate<
      unknown,
      Record<string, unknown> | undefined,
      Record<string, unknown>
    >
    const result = await validate(value, {
      ...field,
      id: typeof data.id === 'number' || typeof data.id === 'string' ? data.id : undefined,
      collectionSlug,
      blockData: undefined,
      data,
      siblingData: data,
      event: 'submit',
      operation: 'update',
      overrideAccess: false,
      path: [field.name],
      preferences: { fields: {} },
      previousValue: undefined,
      req,
    })
    if (typeof result === 'string') errors.push({ path: field.name, message: result })
  }
  if (errors.length) throw new ValidationError({ collection: collectionSlug, req, errors })
}
