import configPromise from '@payload-config'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import React from 'react'

import { PayloadRedirects } from '@/components/PayloadRedirects'
import RichText from '@/components/RichText'
import { SectionLayout } from '@/components/SectionLayout'
import { readPublicActivity } from '@/records/recordQueries'
import { dateNode, RecordMetadata } from './RecordMetadata'

const decode = (slug: string) => {
  try {
    return decodeURIComponent(slug)
  } catch {
    return ''
  }
}

export async function ActivityDetailPage({ params }: { params: Promise<{ slug?: string }> }) {
  const slug = decode((await params).slug ?? '')
  const activity = await readPublicActivity(await getPayload({ config: configPromise }), slug)
  if (!activity) return <PayloadRedirects url={`/activities/${slug}`} />
  return (
    <SectionLayout
      currentLabel={activity.title}
      currentPath={`/activities/${activity.slug}`}
      fallback={{ label: 'Activities', href: '/activities' }}
      section={null}
      trail={[{ label: activity.title }]}
    >
      <article className="container pt-8 pb-16">
        <p className="text-sm font-semibold uppercase tracking-wide">Activity</p>
        <h1 className="mt-2 mb-6 text-3xl font-semibold [overflow-wrap:anywhere]">
          {activity.title}
        </h1>
        <RecordMetadata
          items={[
            { label: 'Date', value: dateNode(activity.eventDate) },
            { label: 'Time', value: activity.time },
            { label: 'Location', value: activity.location },
            { label: 'Organization', value: activity.organization },
            { label: 'Academic year', value: activity.academicYear },
          ]}
        />
        {activity.description && (
          <section aria-labelledby="about-heading" className="mt-10">
            <h2 className="text-xl font-semibold" id="about-heading">
              About this activity
            </h2>
            <RichText className="max-w-[48rem]" data={activity.description} enableGutter={false} />
          </section>
        )}
      </article>
    </SectionLayout>
  )
}

export async function activityMetadata(params: Promise<{ slug?: string }>): Promise<Metadata> {
  const activity = await readPublicActivity(
    await getPayload({ config: configPromise }),
    decode((await params).slug ?? ''),
  )
  return { title: activity ? `${activity.title} | Binturong` : 'Activity | Binturong' }
}
