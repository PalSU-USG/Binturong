import type { Field, RowField } from 'payload'

/**
 * Plain-language presentation for the generated web address field. Only label, help text
 * and position change; names, hooks, validation and uniqueness are the stock ones.
 */
export const plainSlug = (row: RowField): RowField => ({
  ...row,
  admin: { ...row.admin, position: undefined },
  fields: row.fields.map((field): Field => {
    if (field.type === 'text' && field.name === 'slug')
      return {
        ...field,
        label: 'Web address ending',
        admin: {
          ...field.admin,
          description:
            'The last part of the page address. It is filled in from the title; you rarely need to change it.',
        },
      }
    if (field.type === 'checkbox' && field.name === 'generateSlug')
      return { ...field, label: 'Fill in the web address automatically' }
    return field
  }),
})
