import type { CollectionBeforeChangeHook, Field, PayloadRequest } from 'payload'

import { getActiveAccount } from '@/access/activeAccount'

// Per-request: Payload copies req.context into nested Local API calls that receive this req.
const preservedKey = 'preservedLastEditedBy'

export function preserveLastEditedBy(req: PayloadRequest, value: unknown): void {
  const id =
    typeof value === 'object' && value !== null && 'id' in value
      ? (value as { id?: unknown }).id
      : value
  req.context[preservedKey] = typeof id === 'number' ? id : null
}

export function clearPreservedLastEditedBy(req: PayloadRequest): void {
  delete req.context[preservedKey]
}

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
  const previous = originalDoc?.lastEditedBy
  const previousID = typeof previous === 'object' ? previous?.id : previous
  if (req.context && preservedKey in req.context) {
    return {
      ...data,
      lastEditedBy: (req.context[preservedKey] as number | null) ?? previousID ?? null,
    }
  }
  const actor = await getActiveAccount(req)
  return {
    ...data,
    // Without a signed-in account (internal writes), keep the stored value; never trust input.
    lastEditedBy: actor?.id ?? previousID ?? null,
  }
}
