import { NextResponse } from 'next/server'
import {
  headersWithCors,
  meOperation,
  type AuthStrategy,
  type CollectionConfig,
  type CollectionMeHook,
  type PayloadRequest,
  type SanitizedConfig,
} from 'payload'

import type { User } from '@/payload-types'
import { verifyGoogleIdentity } from './googleIdentity'
import { findStaffAccount } from './staffAccount'
import { clearGoogleSession, createAuthRequest, hasSSOSession } from './supabaseRequest'

const sessionExpiry = new WeakMap<PayloadRequest, number>()

export const supabaseStrategy: AuthStrategy = {
  name: 'supabase-sso',
  authenticate: async ({ req, headers, payload, canSetHeaders }) => {
    if (headers.has('authorization') || !hasSSOSession(headers)) return { user: null }
    const response = canSetHeaders ? new NextResponse() : undefined
    response?.headers.set('Cache-Control', 'private, no-store')
    const auth = createAuthRequest(headers, response)
    if (!auth) return { user: null }

    const identity = await verifyGoogleIdentity(auth.client.auth, auth.domain)
    const staff = identity ? await findStaffAccount(payload, identity.email) : null
    if (req && identity && staff?.status === 'active') sessionExpiry.set(req, identity.expiresAt)
    return {
      user:
        staff?.status === 'active'
          ? { ...staff.account, collection: 'users', _strategy: 'supabase-sso' }
          : null,
      responseHeaders: response?.headers,
    }
  },
}

export const ssoMe: CollectionMeHook<User> = ({ args, user }) => {
  const exp = sessionExpiry.get(args.req)
  if (exp) return { exp, user }
}

export function installGoogleSessionEndpoints(config: SanitizedConfig) {
  const users = config.collections.find(({ slug }) => slug === 'users')
  if (!users || !users.endpoints) throw new Error('Expected the native staff session endpoints')

  users.endpoints = users.endpoints.map((endpoint) => {
    if (endpoint.method !== 'post') return endpoint
    if (endpoint.path === '/logout') {
      return {
        ...endpoint,
        handler: async (req) => {
          if (req.user || !hasSSOSession(req.headers)) return endpoint.handler(req)
          await clearSSOCookies(req)
          return Response.json({ message: req.t('authentication:logoutSuccessful') })
        },
      }
    }
    if (endpoint.path !== '/refresh-token') return endpoint
    return {
      ...endpoint,
      handler: async (req) => {
        // Server authentication has already refreshed near-expiry Supabase cookies and checked
        // current staff access. Native refresh mints a Payload JWT and requires a Payload session.
        if (!sessionExpiry.has(req)) return endpoint.handler(req)
        const result = await meOperation({ collection: req.payload.collections.users, req })
        return Response.json(
          { message: req.t('authentication:tokenRefreshSuccessful'), ...result },
          { headers: headersWithCors({ headers: new Headers(), req }) },
        )
      },
    }
  })
}

async function clearSSOCookies(req: PayloadRequest) {
  const response = new NextResponse()
  await clearGoogleSession(createAuthRequest(req.headers, response), req.headers, response)
  req.responseHeaders ??= new Headers()
  for (const cookie of response.headers.getSetCookie())
    req.responseHeaders.append('Set-Cookie', cookie)
  req.responseHeaders.set('Cache-Control', 'private, no-store')
}

export const clearSupabaseSession: NonNullable<CollectionConfig['hooks']>['afterLogout'] = [
  async ({ req }) => {
    if (hasSSOSession(req.headers)) await clearSSOCookies(req)
  },
]
