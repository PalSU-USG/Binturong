import Link from 'next/link'
import React from 'react'

import type { HomeEntry, HomeLink, HomeNotice } from '@/home/getHomeData'
import { formatInstantDate, formatLongDate } from '@/components/records/format'

const sectionTitle =
  'text-[length:var(--text-section)] font-semibold leading-tight [overflow-wrap:anywhere]'
const linkClass = 'inline-flex min-h-11 items-center text-link underline underline-offset-4'
export const actionClass = `${linkClass} font-heading font-semibold`
const metaClass = 'text-[length:var(--text-meta)] text-muted-foreground'
const rowClass = 'grid gap-x-6 gap-y-1 border-t border-border py-3 first:border-t-0'

const rowDate = (entry: HomeEntry) =>
  (entry.instant ? formatInstantDate : formatLongDate)(entry.date)

/** Internal paths use the router; anything else is a plain anchor. */
export function SmartLink({
  href,
  newTab = false,
  className,
  children,
}: {
  href: string
  newTab?: boolean
  className?: string
  children: React.ReactNode
}) {
  if (!newTab && href.startsWith('/') && !href.startsWith('//'))
    return (
      <Link className={className} href={href}>
        {children}
      </Link>
    )
  return (
    <a
      className={className}
      href={href}
      {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
      {newTab && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  )
}

export function HomeSection({
  id,
  title,
  all,
  children,
}: {
  id: string
  title: string
  all?: { label: string; href: string }
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 border-b-2 border-brand pb-2">
        <h2 className={sectionTitle} id={id}>
          {title}
        </h2>
        {all && (
          <SmartLink className={actionClass} href={all.href}>
            {all.label} <span aria-hidden="true">→</span>
          </SmartLink>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>
}

/** Yellow notice band, full width; only rendered when a notice qualifies. */
export function HomeNoticeBlock({ notice }: { notice: HomeNotice }) {
  const date = formatInstantDate(notice.date)
  return (
    <section aria-labelledby="home-notice" className="bg-status-warning-bg text-status-warning-fg">
      <div className="container py-3 text-center">
        <h2
          className="inline text-[length:var(--text-label)] font-semibold uppercase tracking-wide"
          id="home-notice"
        >
          Official notice
        </h2>
        <span aria-hidden="true"> · </span>
        <span className="font-heading text-[length:var(--text-record-title)] font-semibold [overflow-wrap:anywhere]">
          <SmartLink className="underline underline-offset-4" href={notice.href}>
            {notice.title}
          </SmartLink>
        </span>
        {date && (
          <span className="block text-[length:var(--text-meta)]">
            <time dateTime={notice.date ?? undefined}>{date}</time>
          </span>
        )}
      </div>
    </section>
  )
}

function TypeTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-sm border border-link px-2 py-0.5 font-heading text-[length:var(--text-label)] font-semibold uppercase tracking-wide text-link">
      {children}
    </span>
  )
}

/** Latest updates: date, type tag, title and the actions that fit the record. */
export function UpdateList({ entries }: { entries: HomeEntry[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {entries.map((entry) => {
        const date = rowDate(entry)
        return (
          <li className={`${rowClass} sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]`} key={entry.key}>
            <p className={`${metaClass} m-0`}>
              {date ? (
                <>
                  <span className="sr-only">{entry.dateLabel}: </span>
                  <time dateTime={entry.date ?? undefined}>{date}</time>
                </>
              ) : null}
            </p>
            <div className="min-w-0">
              {entry.label && <TypeTag>{entry.label}</TypeTag>}
              <p className="m-0 mt-1 font-heading text-[length:var(--text-record-title)] font-semibold leading-snug [overflow-wrap:anywhere]">
                {entry.title}
              </p>
              {entry.meta && (
                <p className={`${metaClass} m-0 [overflow-wrap:anywhere]`}>{entry.meta}</p>
              )}
            </div>
            <p className="m-0 flex flex-wrap items-center gap-x-5">
              <SmartLink className={actionClass} href={entry.href}>
                {entry.kind === 'record' ? 'Record' : 'Read'}
                <span className="sr-only">: {entry.title}</span>
                <span aria-hidden="true">&nbsp;→</span>
              </SmartLink>
              {entry.fileHref && (
                <a className={actionClass} href={entry.fileHref} download>
                  PDF<span className="sr-only">: {entry.title}</span>
                  <span aria-hidden="true">&nbsp;↓</span>
                </a>
              )}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

/** Activities: date, linked title and time/place. */
export function EntryList({ entries }: { entries: HomeEntry[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {entries.map((entry) => {
        const date = rowDate(entry)
        return (
          <li className={`${rowClass} sm:grid-cols-[8.5rem_minmax(0,1fr)]`} key={entry.key}>
            <p className={`${metaClass} m-0`}>
              {date ? (
                <>
                  <span className="sr-only">{entry.dateLabel}: </span>
                  <time dateTime={entry.date ?? undefined}>{date}</time>
                </>
              ) : null}
            </p>
            <div className="min-w-0">
              <p className="m-0 font-heading text-[length:var(--text-record-title)] font-semibold leading-snug [overflow-wrap:anywhere]">
                <SmartLink
                  className="inline-block py-1 text-link underline underline-offset-4"
                  href={entry.href}
                >
                  {entry.title}
                </SmartLink>
              </p>
              {entry.meta && (
                <p className={`${metaClass} m-0 [overflow-wrap:anywhere]`}>{entry.meta}</p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Latest issuances: number, linked title, date. */
export function IssuanceList({ entries }: { entries: HomeEntry[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {entries.map((entry) => {
        const date = rowDate(entry)
        return (
          <li className={`${rowClass} sm:grid-cols-[10rem_minmax(0,1fr)_auto]`} key={entry.key}>
            <p className="m-0 font-heading font-semibold [overflow-wrap:anywhere]">
              {entry.meta ?? entry.label}
            </p>
            <p className="m-0 min-w-0 [overflow-wrap:anywhere]">
              <SmartLink
                className="inline-block py-1 text-link underline underline-offset-4"
                href={entry.href}
              >
                {entry.title}
              </SmartLink>
            </p>
            <p className={`${metaClass} m-0`}>
              {date ? (
                <>
                  <span className="sr-only">{entry.dateLabel}: </span>
                  <time dateTime={entry.date ?? undefined}>{date}</time>
                </>
              ) : null}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

export function LinkList({ links }: { links: HomeLink[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-8 p-0">
      {links.map((link) => (
        <li key={`${link.label}-${link.href}`}>
          <SmartLink className={actionClass} href={link.href} newTab={link.newTab}>
            {link.label} <span aria-hidden="true">→</span>
          </SmartLink>
        </li>
      ))}
    </ul>
  )
}
