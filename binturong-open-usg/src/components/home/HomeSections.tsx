import Link from 'next/link'
import React from 'react'

import type { HomeEntry, HomeLink, HomeNotice } from '@/home/getHomeData'
import { formatInstantDate, formatLongDate } from '@/components/records/format'

const sectionTitle =
  'text-[length:var(--text-section)] font-semibold leading-tight [overflow-wrap:anywhere]'
const linkClass = 'inline-flex min-h-11 items-center text-link underline underline-offset-4'

/** Internal paths use the router; anything else is a plain anchor. */
function SmartLink({
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
    <section aria-labelledby={id} className="border-b border-border py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6">
        <h2 className={sectionTitle} id={id}>
          {title}
        </h2>
        {all && (
          <SmartLink className={linkClass} href={all.href}>
            {all.label}
          </SmartLink>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>
}

export function HomeNoticeBlock({ notice }: { notice: HomeNotice }) {
  const date = formatInstantDate(notice.date)
  return (
    <section
      aria-labelledby="home-notice"
      className="my-6 border-l-4 border-status-warning-border bg-status-warning-bg p-4 text-status-warning-fg"
    >
      <h2
        className="text-[length:var(--text-label)] font-semibold uppercase tracking-wide"
        id="home-notice"
      >
        Official notice
      </h2>
      <p className="mt-1 text-[length:var(--text-record-title)] font-semibold [overflow-wrap:anywhere]">
        <SmartLink className="underline underline-offset-4" href={notice.href}>
          {notice.title}
        </SmartLink>
      </p>
      {date && (
        <p className="mt-1 text-[length:var(--text-meta)]">
          <time dateTime={notice.date ?? undefined}>{date}</time>
        </p>
      )}
    </section>
  )
}

export function EntryList({ entries }: { entries: HomeEntry[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {entries.map((entry) => {
        const date = (entry.instant ? formatInstantDate : formatLongDate)(entry.date)
        return (
          <li
            className="grid gap-x-6 border-t border-border py-3 first:border-t-0 sm:grid-cols-[10rem_minmax(0,1fr)]"
            key={entry.key}
          >
            <p className="text-[length:var(--text-meta)] text-muted-foreground">
              {date ? (
                <>
                  <span className="sr-only">{entry.dateLabel}: </span>
                  <time dateTime={entry.date ?? undefined}>{date}</time>
                </>
              ) : null}
            </p>
            <div className="min-w-0">
              {entry.label && (
                <p className="text-[length:var(--text-label)] font-semibold uppercase tracking-wide">
                  {entry.label}
                </p>
              )}
              <p className="text-[length:var(--text-record-title)] font-semibold [overflow-wrap:anywhere]">
                <SmartLink
                  className="inline-block py-1 text-link underline underline-offset-4"
                  href={entry.href}
                >
                  {entry.title}
                </SmartLink>
              </p>
              {entry.meta && (
                <p className="text-[length:var(--text-meta)] text-muted-foreground [overflow-wrap:anywhere]">
                  {entry.meta}
                </p>
              )}
              {entry.fileHref && (
                <p>
                  <a className={linkClass} download href={entry.fileHref}>
                    Download PDF<span className="sr-only">: {entry.title}</span>
                  </a>
                </p>
              )}
            </div>
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
          <SmartLink className={linkClass} href={link.href} newTab={link.newTab}>
            {link.label}
          </SmartLink>
        </li>
      ))}
    </ul>
  )
}
