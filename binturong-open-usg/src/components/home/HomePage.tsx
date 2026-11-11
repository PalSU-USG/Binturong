import Image from 'next/image'
import React from 'react'

import type { HomeData } from '@/home/getHomeData'
import { siteDescription } from '@/utilities/mergeOpenGraph'
import {
  Empty,
  EntryList,
  HomeNoticeBlock,
  HomeSection,
  IssuanceList,
  LinkList,
  SmartLink,
  UpdateList,
  actionClass,
} from './HomeSections'

/** Statement wording is owner-approved; it is the page's single h1. */
export const HOME_STATEMENT = siteDescription

/**
 * Institutional front page in `docs/design.md` order: hero, notice, Latest updates, Student
 * services, General plan of activities, Transparency, Latest issuances. Flat rows; an empty section
 * says so honestly, and only the notice and the issuances list are omitted when absent.
 */
export function HomePage({ data }: { data: HomeData }) {
  return (
    <>
      {/* The photo is decorative; the statement is real text on a 90% deep-rust band so it stays
          readable on any part of the picture (checked in design-tokens.int.spec.ts). */}
      <section
        aria-labelledby="home-statement"
        className="relative isolate flex min-h-[clamp(18rem,50vh,32rem)] items-center"
      >
        <Image
          alt=""
          className="-z-10 object-cover object-[50%_40%]"
          fill
          priority
          sizes="100vw"
          src="/brand/campus-gate.png"
        />
        {/* Akademya proportions: a slim band across the photo, not a panel that hides it. */}
        <div className="w-full bg-brand-deep/90 py-4 text-center text-on-brand md:py-5">
          <div className="container">
            <p className="m-0 text-[length:var(--text-label)] font-semibold uppercase tracking-[0.2em]">
              University Student Government
            </p>
            <h1
              className="mx-auto mt-1 max-w-[64rem] text-[clamp(1.75rem,1.2rem+2.2vw,3rem)] font-semibold leading-tight [overflow-wrap:anywhere]"
              id="home-statement"
            >
              {HOME_STATEMENT}
            </h1>
          </div>
        </div>
      </section>

      {data.notice && <HomeNoticeBlock notice={data.notice} />}

      <div className="container pb-16">
        <HomeSection
          all={{ label: 'All updates', href: '/posts' }}
          id="home-updates"
          title="Latest updates"
        >
          {data.updates.length ? (
            <>
              {!data.updatesFresh && (
                <Empty>No updates in the last 30 days; showing the most recent.</Empty>
              )}
              <UpdateList entries={data.updates} />
            </>
          ) : (
            <Empty>No updates have been published yet.</Empty>
          )}
        </HomeSection>

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

        {data.records && (
          <HomeSection id="home-records" title="Latest issuances">
            {data.records.length ? (
              <>
                <IssuanceList entries={data.records} />
                <p className="m-0 mt-2 text-right">
                  <SmartLink className={actionClass} href="/archives">
                    Browse all records <span aria-hidden="true">&nbsp;→</span>
                  </SmartLink>
                </p>
              </>
            ) : (
              <Empty>No issuances have been published yet.</Empty>
            )}
          </HomeSection>
        )}
      </div>
    </>
  )
}
