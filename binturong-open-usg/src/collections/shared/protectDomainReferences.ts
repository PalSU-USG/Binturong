import {
  APIError,
  ValidationError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
  type PayloadRequest,
} from 'payload'

type DomainCollection =
  | 'organizations'
  | 'academic-years'
  | 'offices'
  | 'people'
  | 'activities'
  | 'documents'
  | 'issuances'
  | 'reports'
  | 'posts'
const references: Partial<
  Record<DomainCollection, Record<string, DomainCollection | DomainCollection[]>>
> = {
  offices: { organization: 'organizations', parent: 'offices' },
  people: { 'terms.office': 'offices', 'terms.academicYear': 'academic-years' },
  activities: { organization: 'organizations', academicYear: 'academic-years' },
  documents: { organization: 'organizations', previousVersion: 'documents' },
  issuances: {
    organization: 'organizations',
    issuingOffice: 'offices',
    academicYear: 'academic-years',
    mainDocument: 'documents',
    attachments: 'documents',
    relatedRecords: ['issuances', 'reports', 'posts', 'activities'],
  },
  reports: {
    organization: 'organizations',
    responsibleOffices: 'offices',
    academicYear: 'academic-years',
    mainDocument: 'documents',
    attachments: 'documents',
    relatedRecords: ['issuances', 'reports', 'posts', 'activities'],
  },
}

function invalid(req: PayloadRequest, collection: string, path: string, message: string): never {
  throw new ValidationError({ collection, req, errors: [{ path, message }] })
}

function referenceID(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return
  if (typeof value === 'object' && 'id' in value) return referenceID(value.id)
  const id = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value
  return typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= 2147483647
    ? id
    : undefined
}

function valuesAt(data: unknown, path: string, prefix = ''): { path: string; value: unknown }[] {
  if (Array.isArray(data))
    return data.flatMap((row, index) => valuesAt(row, path, `${prefix}${index}.`))
  if (!data || typeof data !== 'object') return []
  const [key, ...rest] = path.split('.')
  if (!(key in data)) return []
  const value: unknown = Reflect.get(data, key)
  return rest.length
    ? valuesAt(value, rest.join('.'), `${prefix}${key}.`)
    : Array.isArray(value)
      ? value.map((entry, index) => ({ path: `${prefix}${key}.${index}`, value: entry }))
      : [{ path: `${prefix}${key}`, value }]
}

async function hasReferences(
  req: PayloadRequest,
  target: DomainCollection,
  id: number,
): Promise<boolean> {
  for (const [source, paths] of Object.entries(references)) {
    const matching = Object.entries(paths).filter(([, collection]) =>
      Array.isArray(collection) ? collection.includes(target) : collection === target,
    )
    if (!matching.length) continue
    const collection = source as DomainCollection
    const current = await req.payload.find({
      collection,
      req,
      // The enclosing write is authorized; this private existence check exposes no content.
      overrideAccess: true,
      select: { createdAt: true },
      depth: 0,
      limit: 1,
      where: {
        or: matching.map(([path, targets]) => ({
          [path]: { equals: Array.isArray(targets) ? { relationTo: target, value: id } : id },
        })),
      },
    })
    if (current.docs.length) return true
    if (!req.payload.collections[collection].config.versions) continue
    // Filter inside the query so references cannot fall beyond a version-history page.
    const versions = await req.payload.findVersions({
      collection,
      req,
      overrideAccess: true,
      select: { createdAt: true },
      depth: 0,
      limit: 1,
      where: {
        or: matching.map(([path, targets]) => ({
          [`version.${path}`]: {
            equals: Array.isArray(targets) ? { relationTo: target, value: id } : id,
          },
        })),
      },
    })
    if (versions.docs.length) return true
  }
  return false
}

async function snapshots(req: PayloadRequest, collection: DomainCollection, id: number) {
  const canonical = await req.payload.findByID({
    collection,
    id,
    req,
    overrideAccess: false,
    depth: 0,
    disableErrors: true,
  })
  if (!canonical) return []
  if (!req.payload.collections[collection].config.versions) return [canonical]
  const latest = await req.payload.findVersions({
    collection,
    req,
    overrideAccess: false,
    depth: 0,
    limit: 1,
    where: { parent: { equals: id } },
    sort: ['-updatedAt', '-id'],
  })
  return [canonical, ...latest.docs.map(({ version }) => version)]
}

export async function protectDomainReferences({
  args,
  operation,
  req,
}: Parameters<CollectionBeforeOperationHook>[0]): Promise<void> {
  const collection = args.collection.config.slug as DomainCollection
  if (operation === 'delete' && 'id' in args) {
    const id = referenceID(args.id)
    if (id && (await hasReferences(req, collection, id)))
      throw new APIError('This record is referenced by current content or retained history', 409)
  }
  if (!['create', 'update'].includes(operation) || !('data' in args)) return
  if (collection === 'people' && args.data && Object.hasOwn(args.data, 'user'))
    throw new APIError('Public people are separate from login accounts', 403)
}

function dateValue(
  value: unknown,
  req: PayloadRequest,
  collection: string,
  path: string,
): number | undefined {
  if (value === undefined || value === null || value === '') return
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    )
  )
    invalid(req, collection, path, 'Enter a valid date, or leave it unset when unknown.')
  const result = Date.parse(value)
  const day = value.slice(0, 10)
  if (
    !Number.isFinite(result) ||
    new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) !== day
  )
    invalid(req, collection, path, 'Enter a valid calendar date.')
  return result
}

function dateRange(
  data: Record<string, unknown>,
  req: PayloadRequest,
  collection: string,
  prefix = '',
) {
  const start = dateValue(data.startDate, req, collection, `${prefix}startDate`)
  const end = dateValue(data.endDate, req, collection, `${prefix}endDate`)
  if (start !== undefined && end !== undefined && end < start)
    invalid(req, collection, `${prefix}endDate`, 'End date cannot precede start date.')
}

export const validateDomainReferences: CollectionBeforeChangeHook = async ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  const slug = collection.slug as DomainCollection
  const organization = referenceID(data.organization)
  if (['issuances', 'reports'].includes(slug) && data.type != null) {
    const typeField = collection.flattenedFields.find(
      (field) => 'name' in field && field.name === 'type',
    )
    if (
      typeField?.type === 'select' &&
      !typeField.options.some(
        (option) => (typeof option === 'string' ? option : option.value) === data.type,
      )
    )
      invalid(req, slug, 'type', 'Choose a supported record type.')
  }
  for (const [path, targets] of Object.entries(references[slug] ?? {}))
    for (const entry of valuesAt(data, path)) {
      if (entry.value === undefined || entry.value === null || entry.value === '') continue
      let target: DomainCollection
      let value: unknown = entry.value
      if (Array.isArray(targets)) {
        if (
          !value ||
          typeof value !== 'object' ||
          !('relationTo' in value) ||
          !targets.includes(value.relationTo as DomainCollection) ||
          !('value' in value)
        )
          invalid(req, slug, entry.path, 'Choose a supported related record.')
        target = value.relationTo as DomainCollection
        value = value.value
      } else target = targets
      const id = referenceID(value)
      const resolved = id ? await snapshots(req, target, id) : []
      if (!resolved.length)
        invalid(req, slug, entry.path, 'The referenced record no longer exists.')
      if (
        ['issuances', 'reports'].includes(slug) &&
        organization &&
        ['offices', 'documents'].includes(target)
      )
        for (const referenced of resolved)
          if (
            referenceID('organization' in referenced ? referenced.organization : undefined) !==
            organization
          )
            invalid(
              req,
              slug,
              entry.path,
              'The referenced office or document must belong to the same organization.',
            )
    }

  if (slug === 'academic-years') dateRange(data, req, slug)
  if (slug === 'activities') dateValue(data.eventDate, req, slug, 'eventDate')
  if (slug === 'issuances') {
    dateValue(data.issuedDate, req, slug, 'issuedDate')
    dateValue(data.effectiveDate, req, slug, 'effectiveDate')
  }
  if (slug === 'reports') {
    const start = dateValue(data.periodStartDate, req, slug, 'periodStartDate')
    const end = dateValue(data.periodEndDate, req, slug, 'periodEndDate')
    if (start !== undefined && end !== undefined && end < start)
      invalid(req, slug, 'periodEndDate', 'End date cannot precede start date.')
  }
  if (slug === 'people' && data.terms !== undefined && data.terms !== null) {
    if (!Array.isArray(data.terms)) invalid(req, slug, 'terms', 'Enter office terms as a list.')
    for (const [index, term] of data.terms.entries()) {
      if (!term || typeof term !== 'object')
        invalid(req, slug, `terms.${index}`, 'Enter a valid office term.')
      dateRange(term, req, slug, `terms.${index}.`)
    }
  }
  if (slug === 'offices') {
    const organization = referenceID(data.organization)
    if (data.branch != null && !['executive', 'legislative', 'judicial'].includes(data.branch))
      invalid(req, slug, 'branch', 'Choose a supported branch, or leave it unset.')
    if (
      originalDoc?.id &&
      referenceID(originalDoc.organization) !== organization &&
      (await hasReferences(req, 'offices', originalDoc.id))
    )
      throw new APIError('Retained references prevent changing this office’s organization', 409)
    const pending = [referenceID(data.parent)].filter((id): id is number => id !== undefined)
    const visited = new Set<number>()
    while (pending.length) {
      const id = pending.pop()!
      if (id === originalDoc?.id)
        invalid(req, slug, 'parent', 'Office parents cannot form a cycle.')
      if (visited.has(id)) continue
      visited.add(id)
      for (const parent of await snapshots(req, 'offices', id)) {
        if (
          !organization ||
          referenceID('organization' in parent ? parent.organization : undefined) !== organization
        )
          invalid(
            req,
            slug,
            'parent',
            'Parent offices must belong to the same organization in both current and draft content.',
          )
        const next = referenceID('parent' in parent ? parent.parent : undefined)
        if (next) pending.push(next)
      }
    }
  }
  return data
}
