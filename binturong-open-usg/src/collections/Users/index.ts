import type { CollectionConfig } from 'payload'

import { hiddenBelow } from '../../admin/navVisibility'
import { getActiveAccount } from '../../access/activeAccount'
import { userRoles, type UserRole } from '../../access/roles'
import {
  createAccounts,
  deleteAccounts,
  protectAccountChange,
  protectAccountDelete,
  protectAccountOperation,
  readAccounts,
  requireActiveLogin,
} from './hooks/protectAccounts'

const roleLabels: Record<UserRole, string> = {
  editor: 'Editor',
  publisher: 'Publisher',
  admin: 'Admin',
  super_admin: 'Super-admin',
}

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: async ({ req }) => !!(await getActiveAccount(req)),
    create: createAccounts,
    delete: deleteAccounts,
    read: readAccounts,
    update: readAccounts,
    unlock: deleteAccounts,
  },
  labels: { singular: 'Account', plural: 'Accounts' },
  admin: {
    group: 'Accounts',
    hidden: hiddenBelow('admin'),
    description: 'Staff accounts and what each person is allowed to do.',
    defaultColumns: ['name', 'email', 'role'],
    useAsTitle: 'name',
  },
  auth: { useSessions: true },
  hooks: {
    beforeOperation: [protectAccountOperation],
    beforeChange: [protectAccountChange],
    beforeDelete: [protectAccountDelete],
    beforeLogin: [requireActiveLogin],
  },
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
      access: { create: createAccounts, update: createAccounts },
    },
    {
      name: 'disabled',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      access: { create: createAccounts, update: createAccounts },
    },
    {
      name: 'authRevision',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: { hidden: true },
      access: { read: () => false, create: () => false, update: () => false },
    },
  ],
  timestamps: true,
}
