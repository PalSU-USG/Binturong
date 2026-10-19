export const userRoles = ['editor', 'publisher', 'admin', 'super_admin'] as const

export type UserRole = (typeof userRoles)[number]

export function hasRole(role: unknown, minimum: UserRole): boolean {
  const rank = userRoles.findIndex((value) => value === role)
  const requiredRank = userRoles.indexOf(minimum)
  return rank >= 0 && requiredRank >= 0 && rank >= requiredRank
}

export function canManageRole(actor: unknown, target: unknown): boolean {
  return (
    hasRole(target, 'editor') &&
    (actor === 'super_admin' ||
      (actor === 'admin' && (target === 'editor' || target === 'publisher')))
  )
}
