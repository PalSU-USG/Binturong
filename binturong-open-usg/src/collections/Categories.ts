import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { publishContent } from '../access/contentAccess'
import { slugField } from 'payload'
import { plainSlug } from '../fields/plainSlug'

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: publishContent,
    delete: publishContent,
    read: anyone,
    update: publishContent,
  },
  labels: { singular: 'Topic', plural: 'Topics' },
  admin: {
    group: 'Site',
    description: 'Topics used to group posts.',
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
      overrides: plainSlug,
    }),
  ],
}
