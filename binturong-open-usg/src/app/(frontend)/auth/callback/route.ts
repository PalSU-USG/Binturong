import config from '@payload-config'
import { NextResponse, type NextRequest } from 'next/server'
import { createLocalReq, getPayload } from 'payload'

import { verifyGoogleIdentity } from '@/auth/googleIdentity'
import { clearGoogleSession, createAuthRequest, staffSignInOrigin } from '@/auth/supabaseRequest'
import { recordStaffAccessRequest } from '@/collections/AccessRequests'

export async function GET(request: NextRequest) {
  const origin = staffSignInOrigin(request)
  if (!origin) return new Response(null, { status: 403 })
  const { searchParams } = request.nextUrl
  const loginURL = new URL('/admin/login', origin)
  loginURL.searchParams.set(
    'sso',
    searchParams.get('error_code') === 'provider_email_needs_verification' ? 'denied' : 'retry',
  )
  const response = NextResponse.redirect(loginURL, 303)
  response.headers.set('Cache-Control', 'private, no-store')
  const auth = createAuthRequest(request.headers, response)
  const code = searchParams.get('code')
  if (!auth || !code) return response

  const { error } = await auth.client.auth.exchangeCodeForSession(code)
  if (error) return response
  try {
    const identity = await verifyGoogleIdentity(auth.client.auth, auth.domain)
    if (identity) {
      const payload = await getPayload({ config })
      const status = await recordStaffAccessRequest(await createLocalReq({}, payload), identity)
      if (status === 'active') {
        response.headers.set('Location', new URL('/admin', origin).href)
        return response
      }
      loginURL.searchParams.set('sso', status)
    } else {
      loginURL.searchParams.set('sso', 'denied')
    }
  } catch (error) {
    console.error(
      'Google staff sign-in failed after the code exchange',
      error instanceof Error ? error.name : 'Error',
    )
  }
  await clearGoogleSession(auth, request.headers, response)
  response.headers.set('Location', loginURL.href)
  return response
}
