import type { GlobalConfig } from 'payload'
import { publishContent } from '@/access/contentAccess'

import { hiddenBelow } from '@/admin/navVisibility'
import { link } from '@/fields/link'
import { revalidateHeader } from './hooks/revalidateHeader'

export const navigationSections = [
  { label: 'Home', value: 'home' },
  { label: 'Latest Updates', value: 'updates' },
  { label: 'Student Services', value: 'services' },
  { label: 'Government', value: 'government' },
  { label: 'Transparency', value: 'transparency' },
  { label: 'Archives', value: 'archives' },
  { label: 'Contact', value: 'contact' },
]

const maxPrimaryItems = 7

export const Header: GlobalConfig = {
  slug: 'header',
  label: 'Top menu',
  admin: { group: 'Site', hidden: hiddenBelow('publisher'), description: 'The links at the top of every page.' },
  access: {
    update: publishContent,
    read: () => true,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      label: 'Menu items',
      fields: [
        link({
          appearances: false,
        }),
        {
          name: 'section',
          type: 'select',
          options: navigationSections,
          admin: {
            description:
              'Optional section identity used for orientation. Each section may be used once; it does not depend on the label.',
          },
        },
        {
          name: 'children',
          type: 'array',
          label: 'Section links',
          maxRows: 12,
          admin: {
            initCollapsed: true,
            description: 'One level of links shown under this destination.',
          },
          fields: [link({ appearances: false })],
        },
      ],
      maxRows: maxPrimaryItems,
      validate: (rows: unknown) => {
        if (Array.isArray(rows) && rows.length > maxPrimaryItems)
          return `Use at most ${maxPrimaryItems} primary destinations.`
        const used = (Array.isArray(rows) ? rows : []).flatMap((row) =>
          row && typeof row === 'object' && 'section' in row && row.section ? [row.section] : [],
        )
        return new Set(used).size === used.length || 'Each section can be assigned to one row only.'
      },
      admin: {
        initCollapsed: true,
        description: 'The main links readers use to move around the site. Up to 7.',
        components: {
          RowLabel: '@/Header/RowLabel#RowLabel',
        },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateHeader],
  },
}
