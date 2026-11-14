import Link from 'next/link'
import React from 'react'

export type Destination = { href: string; title: string; description?: string }

/**
 * Scannable section rows: title, one plain line and an arrow, all inside one link so the row is
 * one target and its accessible name carries the description (distinct from the nav link of the
 * same title).
 */
export function DestinationList({ items }: { items: Destination[] }) {
  return (
    <ul className="site-destinations">
      {items.map((item) => (
        <li key={item.href}>
          <Link className="site-destination" href={item.href}>
            <span className="site-destination-title">{item.title}</span>
            {item.description ? (
              <span className="site-destination-text">
                <span className="sr-only">. </span>
                {item.description}
              </span>
            ) : null}
            <span aria-hidden="true" className="site-destination-arrow">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
