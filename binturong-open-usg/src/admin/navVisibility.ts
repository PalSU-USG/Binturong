import { hasRole, type UserRole } from '@/access/roles'

/**
 * Presentation only: hides a menu entry from roles below `minimum`. It fails closed for a
 * missing or unknown role. Server access rules are what actually protect the data, and
 * every hidden entry keeps exactly the access it had before.
 */
export const hiddenBelow =
  (minimum: UserRole) =>
  ({ user }: { user?: unknown }): boolean =>
    !hasRole((user as { role?: unknown } | null | undefined)?.role, minimum)
