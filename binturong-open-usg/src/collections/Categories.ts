import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { publishContent } from '../access/contentAccess'
import { slugField } from 'payload'

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: publishContent,
    delete: publishContent,
    read: anyone,
    update: publishContent,
  },
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField({
      position: undefined,
    }),
  ],
}
