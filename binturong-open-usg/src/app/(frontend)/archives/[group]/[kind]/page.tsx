import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { RecordListPage, type SearchParams } from '@/components/records/RecordListPage'
import type { issuanceTypes } from '@/records/recordFilters'

export const dynamic = 'force-dynamic'

type Kind = {
  group: 'legislative' | 'executive'
  groupLabel: string
  kind: string
  title: string
  type: (typeof issuanceTypes)[number]['value']
}

// Each type page belongs to the branch that issues it. Any other pair is a real 404 response
// before anything streams.
const kinds: Kind[] = [
  {
    group: 'legislative',
    groupLabel: 'Legislative',
    kind: 'resolutions',
    title: 'Resolutions',
    type: 'resolution',
  },
  {
    group: 'executive',
    groupLabel: 'Executive',
    kind: 'memoranda',
    title: 'Memoranda',
    type: 'memorandum',
  },
  // G4 (executive orders page) is unanswered. When the owner says "now", add
  // { group: 'executive', groupLabel: 'Executive', kind: 'executive-orders', title: 'Executive orders', type: 'executive_order' }.
]

export const dynamicParams = false
export const generateStaticParams = () => kinds.map(({ group, kind }) => ({ group, kind }))

type Args = {
  params: Promise<{ group: string; kind: string }>
  searchParams: Promise<SearchParams>
}

const find = async (params: Args['params']) => {
  const { group, kind } = await params
  return kinds.find((k) => k.group === group && k.kind === kind)
}

export default async function Page({ params, searchParams }: Args) {
  const page = await find(params)
  if (!page) notFound()
  return (
    <RecordListPage
      basePath={`/archives/${page.group}/${page.kind}`}
      fallback={{ label: 'Archives', href: '/archives' }}
      fixedType={page.type}
      scope={page.group}
      searchParams={searchParams}
      section="archives"
      title={page.title}
      trail={[{ label: page.groupLabel, href: `/archives/${page.group}` }]}
    />
  )
}

export async function generateMetadata({ params }: Pick<Args, 'params'>): Promise<Metadata> {
  const page = await find(params)
  return {
    title: page
      ? `${page.title} | ${page.groupLabel} | Archives | Binturong`
      : 'Archives | Binturong',
  }
}
