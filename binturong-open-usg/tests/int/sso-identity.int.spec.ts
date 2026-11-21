import { describe, expect, it, vi } from 'vitest'

import { verifyGoogleIdentity } from '@/auth/googleIdentity'

const domain = 'psu.palawan.edu.ph'
const email = `editor@${domain}`
const expiresAt = 1_895_000_000
const identity = { provider: 'google', identity_data: { email, email_verified: true } }

function authFor({
  claimedEmail = email,
  confirmed = true,
  identities = [identity],
  method = 'oauth',
  invalid = false,
} = {}) {
  return {
    getClaims: vi.fn().mockResolvedValue({
      data: invalid
        ? null
        : {
            claims: { sub: 'google-user', email: claimedEmail, exp: expiresAt, amr: [{ method }] },
          },
      error: invalid ? new Error('Invalid session') : null,
    }),
    getUser: vi.fn().mockResolvedValue({
      data: {
        user: {
          id: 'google-user',
          email: claimedEmail,
          email_confirmed_at: confirmed ? '2026-11-21T00:00:00Z' : null,
          identities,
          user_metadata: { email_verified: true },
        },
      },
      error: null,
    }),
  }
}

describe('Google SSO identity', () => {
  it('requires a verified Google identity and normalizes the exact campus email', async () => {
    expect(
      await verifyGoogleIdentity(authFor({ claimedEmail: email.toUpperCase() }), domain),
    ).toEqual({ email, expiresAt, name: null })
  })

  it.each([
    'editor@psu.palawan.edu.ph.evil.com',
    'editor@evilpsu.palawan.edu.ph',
    'a@sub.psu.palawan.edu.ph',
  ])('refuses an email outside the configured domain (%s)', async (claimedEmail) => {
    const auth = authFor({ claimedEmail })
    expect(await verifyGoogleIdentity(auth, domain)).toBeNull()
    expect(auth.getUser).not.toHaveBeenCalled()
  })

  it.each([
    { invalid: true },
    { confirmed: false },
    { method: 'password' },
    { identities: [{ ...identity, provider: 'email' }] },
    { identities: [identity, { ...identity, provider: 'github' }] },
    { identities: [{ ...identity, identity_data: { email, email_verified: false } }] },
    {
      identities: [
        { ...identity, identity_data: { email: `somebody-else@${domain}`, email_verified: true } },
      ],
    },
  ])('refuses unverifiable session or identity data (%j)', async (options) => {
    expect(await verifyGoogleIdentity(authFor(options), domain)).toBeNull()
  })
})
