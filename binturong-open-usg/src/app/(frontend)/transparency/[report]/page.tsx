import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { RecordListPage, type SearchParams } from '@/components/records/RecordListPage'
import type { RecordScope } from '@/records/recordFilters'

export const dynamic = 'force-dynamic'
// Unknown segments get a real 404 response before anything streams.
export const dynamicParams = false
export const generateStaticParams = () => Object.keys(pages).map((report) => ({ report }))

const pages: Record<string, { scope: RecordScope; title: string }> = {
  'financial-reports': { scope: 'financial', title: 'Financial reports' },
  'accomplishment-reports': { scope: 'accomplishment', title: 'Accomplishment reports' },
}
const find = (slug: string) => (Object.hasOwn(pages, slug) ? pages[slug] : undefined)

type Args = { params: Promise<{ report: string }>; searchParams: Promise<SearchParams> }

export default async function Page({ params, searchParams }: Args) {
  const slug = (await params).report
  const entry = find(slug)
  if (!entry) notFound()
  return (
    <RecordListPage
      basePath={`/transparency/${slug}`}
      fallback={{ label: 'Transparency', href: '/transparency' }}
      scope={entry.scope}
      searchParams={searchParams}
      section="transparency"
      title={entry.title}
    />
  )
}

export async function generateMetadata({ params }: Pick<Args, 'params'>): Promise<Metadata> {
  const entry = find((await params).report)
  return { title: entry ? entry.title + ' | Binturong' : 'Transparency | Binturong' }
}
