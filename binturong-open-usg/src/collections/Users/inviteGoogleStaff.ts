import { APIError, type Endpoint } from 'payload'

import { campusEmail } from '@/auth/googleIdentity'
import { createGoogleStaff } from '@/auth/staffAccount'
import { googleSSOConfig } from '@/auth/supabaseRequest'
import { createAccounts } from './hooks/protectAccounts'

export const inviteGoogleStaff: Endpoint = {
  path: '/invite-google',
  method: 'post',
  handler: async (req) => {
    if (!(await createAccounts({ req }))) throw new APIError('Admin access is required', 403)
    const config = googleSSOConfig()
    if (!config) throw new APIError('Google sign-in is unavailable', 404)
    let data
    try {
      if (req.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
        throw new Error('JSON required')
      data = await req.json?.()
    } catch {
      throw new APIError('Enter a campus email and role', 400)
    }
    const email = campusEmail(data?.email, config.domain)
    const role: unknown = data?.role
    if (!email || (role !== 'editor' && role !== 'publisher'))
      throw new APIError('Enter a campus email and choose Editor or Publisher', 400)
    const name = typeof data?.name === 'string' ? data.name.trim().slice(0, 160) : undefined
    const account = await createGoogleStaff(req, { email, name, role })
    return Response.json({ id: account.id }, { status: 201 })
  },
}
