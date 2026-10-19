import { describe, expect, it } from 'vitest'

import { canManageRole, hasRole, type UserRole } from '@/access/roles'

const roles: UserRole[] = ['editor', 'publisher', 'admin', 'super_admin']

describe('role policy', () => {
  it('inherits_roles_and_rejects_unknown_values', () => {
    for (const [actorIndex, actor] of roles.entries()) {
      for (const [minimumIndex, minimum] of roles.entries()) {
        expect(hasRole(actor, minimum)).toBe(actorIndex >= minimumIndex)
      }
    }

    for (const value of [
      null,
      undefined,
      true,
      1,
      [],
      ['super_admin'],
      {},
      '',
      'ADMIN',
      'owner',
      'constructor',
      '__proto__',
    ]) {
      expect(hasRole(value, 'editor')).toBe(false)
      expect(canManageRole(value, 'editor')).toBe(false)
      expect(canManageRole('super_admin', value)).toBe(false)
    }
  })

  it('limits_account_management_to_the_approved_targets', () => {
    for (const actor of roles) {
      for (const target of roles) {
        const allowed =
          actor === 'super_admin' || (actor === 'admin' && ['editor', 'publisher'].includes(target))
        expect(canManageRole(actor, target)).toBe(allowed)
      }
    }
  })
})
