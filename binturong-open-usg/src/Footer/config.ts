import type { GlobalConfig } from 'payload'
import { publishContent } from '@/access/contentAccess'

import { hiddenBelow } from '@/admin/navVisibility'
import { link } from '@/fields/link'
import { revalidateFooter } from './hooks/revalidateFooter'

export const Footer: GlobalConfig = {
  slug: 'footer',
  label: 'Bottom links',
  admin: { group: 'Site', hidden: hiddenBelow('publisher'), description: 'The links at the bottom of every page.' },
  access: {
    update: publishContent,
    read: () => true,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      label: 'Links',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 6,
      admin: {
        initCollapsed: true,
        description: 'Links shown at the bottom of every page. Up to 6.',
        components: {
          RowLabel: '@/Footer/RowLabel#RowLabel',
        },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateFooter],
  },
}
