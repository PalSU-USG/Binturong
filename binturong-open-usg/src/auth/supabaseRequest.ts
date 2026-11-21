import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { parseCookies } from 'payload/shared'

const sessionCookie = 'binturong-sso'
const sessionCookieOptions = {
  name: sessionCookie,
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
} as const

const isSessionCookie = (name: string) =>
  name === sessionCookie || name.startsWith(`${sessionCookie}.`)

export function googleSSOConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  const domain = process.env.SSO_ALLOWED_DOMAIN?.trim().toLowerCase()
  return url && key && domain ? { url, key, domain } : null
}

export function staffSignInOrigin(request: NextRequest) {
  const candidates = [
    process.env.NEXT_PUBLIC_SERVER_URL,
    ...[
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ].map((host) => (host ? `https://${host}` : undefined)),
  ]
  const host = request.headers.get('host')
  for (const candidate of candidates) {
    const url = candidate ? URL.parse(candidate) : null
    if (url?.host === host && ['http:', 'https:'].includes(url.protocol)) return url.origin
  }
  return null
}

export function hasSSOSession(headers: Headers) {
  return [...parseCookies(headers).keys()].some(isSessionCookie)
}

export function createAuthRequest(
  headers: Headers,
  response?: NextResponse,
  request?: NextRequest,
) {
  const config = googleSSOConfig()
  if (!config) return null

  const cookies = parseCookies(headers)
  const client = createServerClient(config.url, config.key, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll: response
        ? (writes, headers) => {
            for (const { name, value, options } of writes) {
              cookies.set(name, value)
              request?.cookies.set(name, value)
              response.cookies.set(name, value, options)
            }
            for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
          }
        : undefined,
    },
  })
  return { client, domain: config.domain }
}

export async function clearGoogleSession(
  auth: ReturnType<typeof createAuthRequest>,
  headers: Headers,
  response: NextResponse,
) {
  if (auth) {
    try {
      const { error } = await auth.client.auth.signOut({ scope: 'local' })
      if (error) throw error
    } catch {
      console.warn('Could not revoke the upstream Google sign-in session')
    }
  }
  const names = new Set([
    ...parseCookies(headers).keys(),
    ...response.cookies.getAll().map(({ name }) => name),
  ])
  for (const name of names) {
    if (isSessionCookie(name) || name === `${sessionCookie}-code-verifier`)
      response.cookies.set({ ...sessionCookieOptions, name, value: '', maxAge: 0 })
  }
  response.headers.set('Cache-Control', 'private, no-store')
}
