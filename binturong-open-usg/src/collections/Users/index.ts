import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { userRoles, type UserRole } from '../../access/roles'

const roleLabels: Record<UserRole, string> = {
  editor: 'Editor',
  publisher: 'Publisher',
  admin: 'Admin',
  super_admin: 'Super-admin',
}

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: userRoles.map((value) => ({ label: roleLabels[value], value })),
      access: { create: () => false, update: () => false },
    },
    {
      name: 'disabled',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      access: { create: () => false, update: () => false },
    },
  ],
  timestamps: true,
}
