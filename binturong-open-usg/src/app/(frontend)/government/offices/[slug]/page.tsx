import { OfficeDetailPage } from '@/components/records/GovernmentPages'

export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: Promise<{ slug?: string }> }) {
  return <OfficeDetailPage params={params} />
}
