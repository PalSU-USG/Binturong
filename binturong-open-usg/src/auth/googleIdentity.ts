import type { SupabaseClient } from '@supabase/supabase-js'

export function campusEmail(value: unknown, domain: string) {
  if (typeof value !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(value)) return null
  const email = value.toLowerCase()
  return email.split('@')[1] === domain ? email : null
}

export async function verifyGoogleIdentity(
  auth: Pick<SupabaseClient['auth'], 'getClaims' | 'getUser'>,
  domain: string,
) {
  const { data, error } = await auth.getClaims()
  const claims = data?.claims
  const email = campusEmail(claims?.email, domain)
  if (
    error ||
    !claims ||
    !Number.isFinite(claims.exp) ||
    !email ||
    !claims.amr?.some((entry) => (typeof entry === 'string' ? entry : entry.method) === 'oauth')
  )
    return null

  // Auth's access token has no reliable email_verified claim. Verify the provider identity
  // from Auth itself, rather than trusting the account's editable user_metadata.
  const { data: account, error: lookupError } = await auth.getUser()
  const user = account.user
  if (
    lookupError ||
    user?.id !== claims.sub ||
    user.email?.toLowerCase() !== email ||
    !user.email_confirmed_at
  )
    return null
  if (user.identities?.some((identity) => identity.provider !== 'google')) return null
  const google = user.identities?.find(
    (identity) =>
      identity.provider === 'google' &&
      identity.identity_data?.email_verified === true &&
      typeof identity.identity_data.email === 'string' &&
      identity.identity_data.email.toLowerCase() === email,
  )
  if (!google) return null
  const name = google.identity_data?.full_name ?? google.identity_data?.name
  return {
    email,
    expiresAt: claims.exp,
    name: typeof name === 'string' ? name.trim().slice(0, 160) || null : null,
  }
}
