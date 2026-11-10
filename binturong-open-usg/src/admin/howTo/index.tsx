import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DefaultTemplate } from '@payloadcms/next/templates'
import type { AdminViewServerProps } from 'payload'

import { getActiveAccount } from '@/access/activeAccount'
import { adminCopy } from '@/admin/copy'
import '../dashboard/index.scss'

export default async function HowTo({ initPageResult, params, searchParams }: AdminViewServerProps) {
  if (
    !initPageResult?.permissions?.canAccessAdmin ||
    !(await getActiveAccount(initPageResult.req))
  ) {
    redirect('/admin/login')
  }

  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      req={initPageResult.req}
      searchParams={searchParams}
      user={initPageResult.req.user ?? undefined}
      visibleEntities={{
        collections: initPageResult.visibleEntities?.collections ?? [],
        globals: initPageResult.visibleEntities?.globals ?? [],
      }}
    >
      <div className="admin-home">
        <h1>{adminCopy.howToTitle}</h1>
        {(
          [
            [adminCopy.howToPostTitle, adminCopy.howToPost],
            [adminCopy.howToUploadTitle, adminCopy.howToUpload],
            [adminCopy.howToFixTitle, adminCopy.howToFix],
            [adminCopy.howToAskTitle, adminCopy.howToAsk],
          ] as const
        ).map(([title, text]) => (
          <section key={title} className="admin-home__section">
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
        <p>
          <Link href="/admin">Back to the home page</Link>
        </p>
      </div>
    </DefaultTemplate>
  )
}
