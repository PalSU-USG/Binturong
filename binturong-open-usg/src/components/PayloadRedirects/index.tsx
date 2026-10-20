import type React from 'react'
import config from '@payload-config'
import { getPayload } from 'payload'
import { getCachedRedirects } from '@/utilities/getRedirects'
import { notFound, redirect } from 'next/navigation'

interface Props {
  disableNotFound?: boolean
  url: string
}

/* This component helps us with SSR based dynamic redirects */
export const PayloadRedirects: React.FC<Props> = async ({ disableNotFound, url }) => {
  const redirects = await getCachedRedirects()()

  const redirectItem = redirects.find((redirect) => redirect.from === url)

  if (redirectItem) {
    if (redirectItem.to?.url) {
      redirect(redirectItem.to.url)
    }

    const reference = redirectItem.to?.reference
    const value = reference?.value
    const id = typeof value === 'object' && value ? value.id : value
    if (reference && id) {
      const payload = await getPayload({ config })
      const document = await payload.findByID({
        collection: reference.relationTo,
        id,
        overrideAccess: false,
        draft: false,
        depth: 0,
        disableErrors: true,
        select: { slug: true },
      })
      if (document?.slug)
        redirect(`${reference.relationTo === 'pages' ? '' : '/posts'}/${document.slug}`)
    }
  }

  if (disableNotFound) return null

  notFound()
}
