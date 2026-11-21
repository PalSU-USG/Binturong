import type { Metadata } from 'next'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

import { PayloadRedirects } from '@/components/PayloadRedirects'
import { RecordDetail } from '@/components/records/RecordDetail'
import { SectionLayout } from '@/components/SectionLayout'
import { citation } from '@/records/citation'
import {
  readPublicFileFacts,
  type FileOwner,
  type PublicFileFacts,
} from '@/records/publicFileFacts'
import { readPublicRecord } from '@/records/recordQueries'

const basePath = { issuances: '/issuances', reports: '/reports' } as const

function decode(slug: string): string {
  try {
    return decodeURIComponent(slug)
  } catch {
    return ''
  }
}

/** Shared by the Issuance and Report detail routes. Renders per request so withdrawal is immediate. */
export async function RecordDetailPage({
  collection,
  params,
}: {
  collection: FileOwner
  params: Promise<{ slug?: string }>
}) {
  const slug = decode((await params).slug ?? '')
  const payload = await getPayload({ config: configPromise })
  const record = await readPublicRecord(payload, collection, slug)
  const url = `${basePath[collection]}/${slug}`
  if (!record) return <PayloadRedirects url={url} />

  let facts: PublicFileFacts | null = null
  try {
    facts = await readPublicFileFacts(payload, { collection, id: record.id })
  } catch (error) {
    console.error(
      'Record file facts unavailable:',
      error instanceof Error ? error.message : 'unknown',
    )
  }

  const isIssuance = collection === 'issuances'
  const cited =
    isIssuance &&
    citation({
      typeLabel: record.typeLabel,
      documentNumber: record.identifier,
      seriesLabel: record.academicYear,
    })
  const reportsPage =
    record.typeLabel === 'Financial report'
      ? { label: 'Financial reports', href: '/transparency/financial-reports' }
      : { label: 'Accomplishment reports', href: '/transparency/accomplishment-reports' }
  return (
    <SectionLayout
      currentLabel={record.title}
      currentPath={`${basePath[collection]}/${record.slug}`}
      fallback={
        isIssuance
          ? { label: 'Archives', href: '/archives' }
          : { label: 'Transparency', href: '/transparency' }
      }
      eyebrow={record.typeLabel}
      intro={cited ? <span className="tabular-nums">{cited}</span> : record.identifier || undefined}
      section={isIssuance ? 'archives' : 'transparency'}
      title={record.title}
      trail={[...(isIssuance ? [] : [reportsPage]), { label: record.title }]}
    >
      <RecordDetail facts={facts} record={record} />
    </SectionLayout>
  )
}

export async function recordMetadata(
  collection: FileOwner,
  params: Promise<{ slug?: string }>,
): Promise<Metadata> {
  const payload = await getPayload({ config: configPromise })
  const record = await readPublicRecord(payload, collection, decode((await params).slug ?? ''))
  return { title: record ? `${record.title} | Binturong` : 'Record | Binturong' }
}
