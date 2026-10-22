import { slugField, ValidationError, type FieldHook, type RowField, type Where } from 'payload'

const uniqueDomainSlug: FieldHook = async ({ collection, originalDoc, req, value }) => {
  if (!collection || typeof value !== 'string' || !value) return value
  const where: Where = { slug: { equals: value } }
  if (originalDoc?.id !== undefined) where.id = { not_equals: originalDoc.id }

  for (const draft of [false, true]) {
    const existing = await req.payload.find({
      collection: collection.slug,
      draft,
      where,
      depth: 0,
      limit: 1,
      req,
      overrideAccess: false,
      select: { slug: true },
    })
    if (existing.docs.length)
      throw new ValidationError({
        collection: collection.slug,
        req,
        errors: [
          { path: 'slug', message: 'This slug is already used by another record or draft.' },
        ],
      })
  }
  return value
}

export function domainSlug(useAsSlug: 'name' | 'label' | 'title'): RowField {
  return slugField({
    useAsSlug,
    overrides: (row) => ({
      ...row,
      fields: row.fields.map((field) =>
        field.type === 'text' && field.name === 'slug'
          ? {
              ...field,
              hooks: {
                ...field.hooks,
                beforeChange: [...(field.hooks?.beforeChange ?? []), uniqueDomainSlug],
              },
            }
          : field,
      ),
    }),
  })
}
