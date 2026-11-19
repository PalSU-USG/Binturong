import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { RecordListPage, type SearchParams } from '@/components/records/RecordListPage'

export const dynamic = 'force-dynamic'

// Resolutions come from the Legislative department, so only /archives/legislative/resolutions exists.
const BRANCH = 'legislative'

type Args = { params: Promise<{ group: string }>; searchParams: Promise<SearchParams> }

export default async function Page({ params, searchParams }: Args) {
  if ((await params).group !== BRANCH) notFound()
  return (
    <RecordListPage
      basePath={`/archives/${BRANCH}/resolutions`}
      fallback={{ label: 'Archives', href: '/archives' }}
      fixedType="resolution"
      scope={BRANCH}
      searchParams={searchParams}
      section="archives"
      title="Resolutions"
      trail={[{ label: 'Legislative', href: `/archives/${BRANCH}` }]}
    />
  )
}

export async function generateMetadata({ params }: Pick<Args, 'params'>): Promise<Metadata> {
  return {
    title:
      (await params).group === BRANCH
        ? 'Resolutions | Legislative | Archives | Binturong'
        : 'Archives | Binturong',
  }
}
