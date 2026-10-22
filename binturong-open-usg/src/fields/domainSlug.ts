import { slugField, ValidationError, type FieldHook, type RowField } from 'payload'
import { hasDomainKey } from '@/collections/shared/hasDomainKey'

const uniqueDomainSlug: FieldHook = async ({ collection, originalDoc, req, value }) => {
  if (!collection || typeof value !== 'string' || !value) return value
  if (await hasDomainKey(req, collection.slug, { slug: { equals: value } }, originalDoc?.id))
    throw new ValidationError({
      collection: collection.slug,
      req,
      errors: [{ path: 'slug', message: 'This slug is already used by another record or draft.' }],
    })
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
