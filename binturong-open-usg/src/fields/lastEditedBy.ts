import type { CollectionBeforeChangeHook, Field } from 'payload'

import { getActiveAccount } from '@/access/activeAccount'

/**
 * Server-owned "who saved this last". Staff can read it; nobody can write it through the
 * API (field access strips client input) and the hook below overwrites it from the
 * authenticated account anyway. It stores only a user ID and is never readable publicly.
 */
export const lastEditedByField: Field = {
  name: 'lastEditedBy',
  type: 'relationship',
  relationTo: 'users',
  label: 'Last saved by',
  index: true,
  access: {
    read: async ({ req }) => Boolean(await getActiveAccount(req)),
    create: () => false,
    update: () => false,
  },
  admin: {
    readOnly: true,
    position: 'sidebar',
    description: 'Filled in automatically with the person who last saved this.',
  },
}

export const setLastEditedBy: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const actor = await getActiveAccount(req)
  const previous = originalDoc?.lastEditedBy
  return {
    ...data,
    // Without a signed-in account (internal writes), keep the stored value; never trust input.
    lastEditedBy: actor?.id ?? (typeof previous === 'object' ? previous?.id : previous) ?? null,
  }
}
