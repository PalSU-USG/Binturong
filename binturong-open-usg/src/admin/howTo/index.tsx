import React from 'react'
import Link from 'next/link'

import { adminCopy } from '@/admin/copy'
import '../dashboard/index.scss'

export default function HowTo() {
  return (
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
  )
}
