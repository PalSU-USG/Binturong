'use client'

import { Button, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export default function InviteForm() {
  const { config } = useConfig()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setPending(true)
    setMessage('')
    try {
      const response = await fetch(`${config.routes.api}/users/invite-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      })
      if (!response.ok) {
        setMessage('Could not create the account. Check the campus email and existing accounts.')
        return
      }
      form.reset()
      setMessage('Account created. Staff can now sign in with Google.')
      router.refresh()
    } catch {
      setMessage('Could not confirm the result. Refresh and check the account list.')
    } finally {
      setPending(false)
    }
  }

  return (
    <details>
      <summary>Invite Google staff</summary>
      <form onSubmit={invite}>
        <label>
          Campus email <input autoComplete="email" name="email" required type="email" />
        </label>
        <label>
          Name <input autoComplete="name" name="name" maxLength={160} />
        </label>
        <label>
          Role
          <select name="role">
            <option value="editor">Editor</option>
            <option value="publisher">Publisher</option>
          </select>
        </label>
        <Button disabled={pending} size="small" type="submit">
          Create account
        </Button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  )
}
