import { slugField, ValidationError, type FieldHook, type RowField } from 'payload'
import { hasDomainKey } from '@/collections/shared/hasDomainKey'
import { plainSlug } from './plainSlug'

const uniqueDomainSlug: FieldHook = async ({ collection, originalDoc, req, value }) => {
  if (!collection) return value
  if (originalDoc?.id) {
    // The enclosing write holds authority; native draft selection can return an older tied version.
    const canonical = await req.payload.db.findOne<{
      id: number
      slug?: string
      publishedAt?: string
    }>({
      collection: collection.slug,
      where: { id: { equals: originalDoc.id } },
      select: { slug: true, publishedAt: true },
      req,
    })
    if (canonical?.publishedAt && canonical.slug !== value)
      throw new ValidationError({
        collection: collection.slug,
        req,
        errors: [
          {
            path: 'slug',
            message: 'The published slug is permanent. A correction requires a redirect migration.',
          },
        ],
      })
  }
  if (typeof value !== 'string' || !value) return value
  if (await hasDomainKey(req, collection.slug, { slug: { equals: value } }, originalDoc?.id))
    throw new ValidationError({
      collection: collection.slug,
      req,
      errors: [{ path: 'slug', message: 'This slug is already used by another record or draft.' }],
    })
  return value
}

export function domainSlug(useAsSlug: 'name' | 'label' | 'title'): RowField {
  return plainSlug(
    slugField({
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
            : field.type === 'checkbox' && field.name === 'generateSlug'
              ? {
                  ...field,
                  hooks: {
                    ...field.hooks,
                    beforeChange: [
                      async (args) => {
                        const generate = args.value === true
                        let value = args.value
                        for (const hook of field.hooks?.beforeChange ?? [])
                          value = await hook({ ...args, value })
                        if (generate) await uniqueDomainSlug({ ...args, value: args.data?.slug })
                        return value
                      },
                    ],
                  },
                }
              : field,
        ),
      }),
    }),
  )
}
