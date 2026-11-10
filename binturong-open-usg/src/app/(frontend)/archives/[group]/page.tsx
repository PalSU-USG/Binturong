import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { RecordListPage, type SearchParams } from '@/components/records/RecordListPage'
import type { RecordScope } from '@/records/recordFilters'

export const dynamic = 'force-dynamic'
// Unknown segments get a real 404 response before anything streams.
export const dynamicParams = false
export const generateStaticParams = () => Object.keys(groups).map((group) => ({ group }))

const groups: Record<string, { scope: RecordScope; title: string }> = {
  executive: { scope: 'executive', title: 'Executive' },
  legislative: { scope: 'legislative', title: 'Legislative' },
  judicial: { scope: 'judicial', title: 'Judicial' },
  'participating-csgs': { scope: 'csg', title: 'Participating CSGs' },
}
const find = (group: string) => (Object.hasOwn(groups, group) ? groups[group] : undefined)

type Args = { params: Promise<{ group: string }>; searchParams: Promise<SearchParams> }

export default async function Page({ params, searchParams }: Args) {
  const group = (await params).group
  const entry = find(group)
  if (!entry) notFound()
  return (
    <RecordListPage
      basePath={`/archives/${group}`}
      fallback={{ label: 'Archives', href: '/archives' }}
      scope={entry.scope}
      searchParams={searchParams}
      section="archives"
      title={entry.title}
      trail={[]}
    />
  )
}

export async function generateMetadata({ params }: Pick<Args, 'params'>): Promise<Metadata> {
  const entry = find((await params).group)
  return { title: entry ? entry.title + ' | Archives | Binturong' : 'Archives | Binturong' }
}
