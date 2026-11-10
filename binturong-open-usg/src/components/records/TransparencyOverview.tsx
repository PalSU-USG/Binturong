import configPromise from '@payload-config'
import Link from 'next/link'
import { getPayload } from 'payload'
import React from 'react'

import { SectionLayout } from '@/components/SectionLayout'
import { parseRecordFilters } from '@/records/recordFilters'
import { listRecords } from '@/records/recordQueries'
import { RecordRow } from './RecordRow'

const LATEST = 5
const sections = [
  {
    scope: 'financial',
    title: 'Financial reports',
    href: '/transparency/financial-reports',
    none: 'No financial reports have been published yet.',
  },
  {
    scope: 'accomplishment',
    title: 'Accomplishment reports',
    href: '/transparency/accomplishment-reports',
    none: 'No accomplishment reports have been published yet.',
  },
] as const

/** Its own overview page. No introduction is shown until approved copy exists. */
export async function TransparencyOverview() {
  const payload = await getPayload({ config: configPromise })
  const lists = await Promise.all(
    sections.map((s) => listRecords(payload, s.scope, parseRecordFilters({}, s.scope))),
  )
  return (
    <SectionLayout
      currentLabel="Transparency"
      currentPath="/transparency"
      fallback={{ label: 'Transparency' }}
      section="transparency"
      trail={[]}
    >
      <div className="container pt-8 pb-16">
        <h1 className="text-3xl font-semibold">Transparency</h1>
        {sections.map((s, i) => {
          const list = lists[i]!
          return (
            <section aria-labelledby={`${s.scope}-heading`} className="mt-10" key={s.scope}>
              <h2 className="text-2xl font-semibold" id={`${s.scope}-heading`}>
                {s.title}
              </h2>
              {list.rows.length === 0 ? (
                <p className="mt-2" role="status">
                  {s.none}
                </p>
              ) : (
                <>
                  <ol className="mt-2">
                    {list.rows.slice(0, LATEST).map((row) => (
                      <RecordRow key={row.key} row={row} headingLevel={3} />
                    ))}
                  </ol>
                  <Link className="inline-flex min-h-11 items-center underline" href={s.href}>
                    View all {s.title.toLowerCase()} ({list.total})
                  </Link>
                </>
              )}
            </section>
          )
        })}
      </div>
    </SectionLayout>
  )
}
