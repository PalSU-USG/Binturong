import Link from 'next/link'
import React from 'react'

const pagerClass =
  'inline-flex min-h-[var(--target-hit)] items-center px-4 font-heading font-semibold text-link underline underline-offset-4'

/** Newer/older links around a "Page x of y" label; shared by the updates list and search. */
export function Pager({
  label,
  page,
  totalPages,
  prev,
  next,
}: {
  label: string
  page: number
  totalPages: number
  prev?: { href: string; text: string }
  next?: { href: string; text: string }
}) {
  return (
    <nav aria-label={label} className="mt-8 flex flex-wrap items-center gap-2">
      {prev && (
        <Link className={pagerClass} href={prev.href} rel="prev">
          <span aria-hidden="true">←&nbsp;</span>
          {prev.text}
        </Link>
      )}
      <span className="px-2 text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      {next && (
        <Link className={pagerClass} href={next.href} rel="next">
          {next.text}
          <span aria-hidden="true">&nbsp;→</span>
        </Link>
      )}
    </nav>
  )
}