import { Field } from 'payload'

export const searchFields: Field[] = [
  { name: 'identifier', type: 'text', admin: { readOnly: true } },
  { name: 'identifierKey', type: 'text', index: true, admin: { readOnly: true } },
  { name: 'summary', type: 'text', maxLength: 300, admin: { readOnly: true } },
  { name: 'publishedAt', type: 'date', admin: { readOnly: true } },
  { name: 'sortAt', type: 'date', index: true, admin: { readOnly: true } },
  {
    name: 'slug',
    type: 'text',
    index: true,
    admin: {
      readOnly: true,
    },
  },
  {
    name: 'meta',
    label: 'Meta',
    type: 'group',
    index: true,
    admin: {
      readOnly: true,
    },
    fields: [
      {
        type: 'text',
        name: 'title',
        label: 'Title',
      },
      {
        type: 'text',
        name: 'description',
        label: 'Description',
      },
      {
        name: 'image',
        label: 'Image',
        type: 'upload',
        relationTo: 'media',
      },
    ],
  },
  {
    label: 'Categories',
    name: 'categories',
    type: 'array',
    admin: {
      readOnly: true,
    },
    fields: [
      {
        name: 'relationTo',
        type: 'text',
      },
      {
        name: 'categoryID',
        type: 'text',
      },
      {
        name: 'title',
        type: 'text',
      },
    ],
  },
]
