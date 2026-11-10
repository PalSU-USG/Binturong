import React from 'react'

import type { PublicFile, PublicFileFacts } from '@/records/publicFileFacts'
import { formatSize } from './format'

const fileHref = (file: PublicFile) => `/api/documents/${file.id}/file`
const linkClass =
  'inline-flex min-h-11 items-center rounded border border-foreground px-4 py-2 font-semibold underline'

/** `facts` is null when the file facts could not be read; the page then says so instead of linking. */
export function DocumentActions({ facts }: { facts: PublicFileFacts | null }) {
  if (!facts)
    return (
      <p role="status">The official file is temporarily unavailable. Please try again later.</p>
    )
  if (!facts.main)
    return <p role="status">The official file for this record is not available for download.</p>
  const size = formatSize(facts.main.size)
  return (
    <div className="flex flex-col gap-4">
      <a className={linkClass} download href={fileHref(facts.main)}>
        Download PDF{size ? ` (${size})` : ''}
      </a>
      {facts.attachments.length > 0 && (
        <section aria-labelledby="attachments-heading">
          <h2 className="text-xl font-semibold" id="attachments-heading">
            Documents
          </h2>
          <ul className="mt-2">
            {facts.attachments.map((file) => (
              <li key={file.id}>
                <a
                  className="inline-flex min-h-11 items-center underline"
                  download
                  href={fileHref(file)}
                >
                  {file.filename}
                  {formatSize(file.size) ? ` (${formatSize(file.size)})` : ''}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
