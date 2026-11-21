import type { ServerProps } from 'payload'

import { googleSSOConfig } from '@/auth/supabaseRequest'

const messages = {
  requested: 'Your request was sent. Ask an administrator about access.',
  disabled: 'Your staff account is disabled. Contact an administrator.',
  denied: 'Use your verified campus Google account.',
  retry: 'Google sign-in could not finish. Try again.',
}

export default function GoogleSignIn({ searchParams }: Pick<ServerProps, 'searchParams'>) {
  if (!googleSSOConfig()) return null
  const status = searchParams?.sso
  const message =
    typeof status === 'string' && Object.hasOwn(messages, status)
      ? messages[status as keyof typeof messages]
      : null
  return (
    <form action="/auth/google" method="post">
      {message && <p role="status">{message}</p>}
      <button className="btn btn--style-secondary btn--size-medium" type="submit">
        Sign in with Google
      </button>
    </form>
  )
}
