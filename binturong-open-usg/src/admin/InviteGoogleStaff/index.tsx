import { googleSSOConfig } from '@/auth/supabaseRequest'
import InviteForm from './InviteForm'

export default function InviteGoogleStaff() {
  return googleSSOConfig() ? <InviteForm /> : null
}
