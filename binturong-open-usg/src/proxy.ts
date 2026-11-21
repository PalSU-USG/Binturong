import { NextResponse, type NextRequest } from 'next/server'

import { createAuthRequest, hasSSOSession } from '@/auth/supabaseRequest'

export async function proxy(request: NextRequest) {
  if (!hasSSOSession(request.headers)) return NextResponse.next()
  const refreshResponse = new NextResponse()
  const auth = createAuthRequest(request.headers, refreshResponse, request)
  if (!auth) return NextResponse.next()

  // Server components cannot persist refreshed cookies. Forward them in both directions here.
  await auth.client.auth.getClaims()
  const response = NextResponse.next({ request: { headers: request.headers } })
  for (const [name, value] of refreshResponse.headers) response.headers.append(name, value)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const config = {
  matcher: ['/((?!api/|auth/|_next/|.*\\.).*)'],
}
