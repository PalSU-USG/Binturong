import { NextResponse, type NextRequest } from 'next/server'

import { createAuthRequest, staffSignInOrigin } from '@/auth/supabaseRequest'

export async function POST(request: NextRequest) {
  const origin = staffSignInOrigin(request)
  if (!origin || request.headers.get('origin') !== origin)
    return new Response(null, { status: 403 })
  const response = NextResponse.redirect(new URL('/admin/login?sso=retry', origin), 303)
  response.headers.set('Cache-Control', 'private, no-store')
  const auth = createAuthRequest(request.headers, response)
  if (!auth) return response

  const { data, error } = await auth.client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: new URL('/auth/callback', origin).href,
      queryParams: { hd: auth.domain, prompt: 'select_account' },
      skipBrowserRedirect: true,
    },
  })
  if (!error && data.url) response.headers.set('Location', data.url)
  return response
}
