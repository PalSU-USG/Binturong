import Link from 'next/link'
import React from 'react'

import RichText from '@/components/RichText'
import type { PublicFileFacts } from '@/records/publicFileFacts'
import type { PublicRecord } from '@/records/recordQueries'
import { DocumentActions } from './DocumentActions'
import { formatSize } from './format'
import { DateValue, dateNode, RecordMetadata } from './RecordMetadata'
import { RelatedRecords } from './RelatedRecords'

export function RecordDetail({
  record,
  facts,
}: {
  record: PublicRecord
  /** Null when the file facts could not be read. */
  facts: PublicFileFacts | null
}) {
  const offices = record.offices.length
    ? record.offices.map((office, index) => (
        <React.Fragment key={office.href}>
          {index > 0 && '; '}
          <Link className="underline" href={office.href}>
            {office.name}
          </Link>
        </React.Fragment>
      ))
    : null
  const isReport = record.collection === 'reports'
  const main = facts?.main
  const versions = facts?.versions ?? []
  return (
    <article className="pt-6 pb-16">

      <RecordMetadata
        items={[
          { label: 'Published', value: dateNode(record.publishedAt) },
          { label: 'Last updated', value: dateNode(record.updatedAt) },
          { label: 'Issued', value: dateNode(record.issuedDate) },
          {
            label: 'Effective',
            value: dateNode(record.effectiveDate),
          },
          { label: 'Reporting period', value: record.reportingPeriod },
          {
            label: 'Period starts',
            value: dateNode(record.periodStartDate),
          },
          {
            label: 'Period ends',
            value: dateNode(record.periodEndDate),
          },
          { label: isReport ? 'Responsible offices' : 'Issuing office', value: offices },
          { label: 'Academic year', value: record.academicYear },
          { label: 'Organization', value: record.organization },
          { label: 'Version label', value: record.sourceVersionLabel },
        ]}
      />

      <div className="mt-8">
        <DocumentActions facts={facts} />
      </div>

      {record.summary && (
        <section aria-labelledby="summary-heading" className="mt-10">
          <h2 className="text-xl font-semibold" id="summary-heading">
            {isReport ? 'Abstract' : 'Summary'}
          </h2>
          <RichText className="max-w-[48rem]" data={record.summary} enableGutter={false} />
        </section>
      )}

      {main && (
        <section aria-labelledby="info-heading" className="mt-10">
          <h2 className="text-xl font-semibold" id="info-heading">
            Document information
          </h2>
          <RecordMetadata
            items={[
              { label: 'File name', value: main.filename },
              { label: 'Size', value: formatSize(main.size) },
              {
                label: 'Checksum (SHA-256)',
                value: main.sha256 && (
                  <code className="[overflow-wrap:anywhere]">{main.sha256}</code>
                ),
              },
            ]}
          />
        </section>
      )}

      {versions.length > 0 && (
        <section aria-labelledby="versions-heading" className="mt-10">
          <h2 className="text-xl font-semibold" id="versions-heading">
            Version history
          </h2>
          <ol className="mt-2 flex flex-col gap-1">
            {[...versions].reverse().map((version) => (
              <li key={version.number}>
                Version {version.number}
                {version.current ? ' (current)' : ''}
                {version.date ? (
                  <>
                    , <DateValue value={version.date} />
                  </>
                ) : null}
                {formatSize(version.size) ? `, ${formatSize(version.size)}` : ''}
              </li>
            ))}
          </ol>
        </section>
      )}

      <RelatedRecords items={record.related} />
    </article>
  )
}
