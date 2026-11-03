import { ValidationError, type PayloadRequest } from 'payload'
import type { DomainCollection } from './domainCollections'
import {
  references,
  referenceID,
  valuesAt,
  validateDomainReferences,
} from './protectDomainReferences'
import { validateOfficialCandidate, validateSavedCandidateFields } from './officialFiles'

export async function validateDomainPublication(
  req: PayloadRequest,
  collection: DomainCollection,
  candidate: Record<string, unknown>,
  canonical: Record<string, unknown>,
) {
  if (collection !== 'issuances' && collection !== 'reports') {
    await validateSavedCandidateFields(req, collection, candidate)
    await validateDomainReferences({
      collection: req.payload.collections[collection].config,
      data: candidate,
      originalDoc: canonical,
      operation: 'update',
      context: req.context,
      req,
    })
  }
  for (const [path, targets] of Object.entries(references[collection] ?? {})) {
    if (Array.isArray(targets) || targets === 'documents') continue
    for (const entry of valuesAt(candidate, path)) {
      if (entry.value == null || entry.value === '') continue
      const id = referenceID(entry.value)
      const referenced = id
        ? await req.payload.findByID({
            collection: targets,
            id,
            draft: false,
            depth: 0,
            overrideAccess: false,
            req,
            disableErrors: true,
          })
        : null
      if (!referenced || !('_status' in referenced) || referenced._status !== 'published')
        throw new ValidationError({
          req,
          collection,
          errors: [
            { path: entry.path, message: 'Publish the referenced record before using it here.' },
          ],
        })
      if (
        targets === 'organizations' &&
        'kind' in referenced &&
        referenced.kind === 'csg' &&
        !referenced.participating
      )
        throw new ValidationError({
          req,
          collection,
          errors: [{ path: entry.path, message: 'This CSG is not currently participating.' }],
        })
    }
  }
  if (collection === 'issuances' || collection === 'reports')
    return validateOfficialCandidate(req, collection, candidate)
}
