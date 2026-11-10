import React from 'react'

import { formatLongDate } from './format'

/** A  ime element, or null when the date is missing or unreadable so the row is omitted. */
export const dateNode = (value: string | null | undefined) =>
  formatLongDate(value) ? <DateValue value={value} /> : null

export function DateValue({ value }: { value: string | null | undefined }) {
  const text = formatLongDate(value)
  return text ? <time dateTime={String(value)}>{text}</time> : null
}

type Item = { label: string; value: React.ReactNode }

/** Unset values are omitted rather than shown as "N/A" or zero. */
export function RecordMetadata({ items }: { items: Item[] }) {
  const shown = items.filter(
    (item) => item.value !== null && item.value !== undefined && item.value !== false,
  )
  if (!shown.length) return null
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[max-content_1fr]">
      {shown.map((item) => (
        <React.Fragment key={item.label}>
          <dt className="font-semibold">{item.label}</dt>
          <dd className="m-0 [overflow-wrap:anywhere]">{item.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}
