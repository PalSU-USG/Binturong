import React from 'react'

import type { HomeData } from '@/home/getHomeData'
import { siteDescription } from '@/utilities/mergeOpenGraph'
import { Empty, EntryList, HomeNoticeBlock, HomeSection, LinkList } from './HomeSections'

/** Statement wording is owner-approved; it is the page's single h1. */
export const HOME_STATEMENT = siteDescription

/**
 * Institutional front page in publication order. Server-rendered flat rows; an empty section says
 * so honestly, and only the notice and non-live record types are omitted when absent.
 */
export function HomePage({ data }: { data: HomeData }) {
  return (
    <div className="container pb-16">
      <section aria-labelledby="home-statement" className="border-b border-border pt-10 pb-8">
        <p className="text-[length:var(--text-label)] font-semibold uppercase tracking-wide">
          University Student Government
        </p>
        <h1
          className="mt-2 max-w-[var(--measure)] text-[length:var(--text-statement)] font-semibold leading-tight [overflow-wrap:anywhere]"
          id="home-statement"
        >
          {HOME_STATEMENT}
        </h1>
      </section>

      {data.notice && <HomeNoticeBlock notice={data.notice} />}

      <HomeSection
        all={{ label: 'All updates', href: '/posts' }}
        id="home-updates"
        title="Latest updates"
      >
        {data.updates.length ? (
          <EntryList entries={data.updates} />
        ) : (
          <Empty>No updates have been published yet.</Empty>
        )}
      </HomeSection>

      {data.records && (
        <HomeSection
          all={{ label: 'All archives', href: '/archives' }}
          id="home-records"
          title="Recent issuances and reports"
        >
          {data.records.length ? (
            <EntryList entries={data.records} />
          ) : (
            <Empty>No issuances or reports have been published yet.</Empty>
          )}
        </HomeSection>
      )}

      <HomeSection id="home-services" title="Student services">
        {data.services.length ? (
          <LinkList links={data.services} />
        ) : (
          <Empty>No student service links have been published yet.</Empty>
        )}
      </HomeSection>

      <HomeSection
        all={{ label: 'All activities', href: '/activities' }}
        id="home-activities"
        title="General plan of activities"
      >
        {data.activities.length ? (
          <EntryList entries={data.activities} />
        ) : (
          <Empty>No upcoming activities have been published.</Empty>
        )}
      </HomeSection>

      <HomeSection id="home-transparency" title="Transparency">
        {data.transparency.length ? (
          <LinkList links={data.transparency} />
        ) : (
          <Empty>No transparency links have been published yet.</Empty>
        )}
      </HomeSection>
    </div>
  )
}
