'use client'

import { Button, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function ApproveAccessRequest() {
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  if (!id) return null

  async function approve(role: 'editor' | 'publisher') {
    setPending(true)
    setError('')
    try {
      const response = await fetch(`${config.routes.api}/access-requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!response.ok) throw new Error('Approval failed')
      router.push(`${config.routes.admin}/collections/access-requests`)
      router.refresh()
    } catch {
      setError(
        'Could not approve this request. Refresh and check whether the account already exists.',
      )
      setPending(false)
    }
  }

  return (
    <>
      <Button disabled={pending} onClick={() => approve('editor')} size="small" type="button">
        Approve as Editor
      </Button>
      <Button disabled={pending} onClick={() => approve('publisher')} size="small" type="button">
        Approve as Publisher
      </Button>
      {error && <p role="alert">{error}</p>}
    </>
  )
}
