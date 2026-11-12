import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { HomePage } from '@/components/home/HomePage'
import type { HomeData, HomeEntry } from '@/home/getHomeData'

const entry = (over: Partial<HomeEntry> = {}): HomeEntry => ({
  key: 'posts-1',
  date: '2026-11-09T00:00:00.000Z',
  dateLabel: 'Published',
  label: 'Announcement',
  title: 'Consultation schedule',
  href: '/posts/consultation-schedule',
  meta: null,
  fileHref: null,
  instant: true,
  kind: 'update',
  ...over,
})
const memo = entry({
  key: 'issuances-2',
  label: 'Memorandum',
  title: 'Memo No. 17',
  href: '/issuances/memo-17',
  meta: 'Memo No. 17',
  fileHref: '/api/documents/9/file',
  kind: 'record',
})
const data = (over: Partial<HomeData> = {}): HomeData => ({
  notice: null,
  updates: [entry(), memo],
  updatesFresh: true,
  records: [memo],
  activities: [
    entry({
      key: 'activities-3',
      dateLabel: 'Date',
      label: 'Activity',
      title: 'General assembly',
      href: '/activities/ga',
      meta: '9:00 AM · Gym',
    }),
  ],
  services: [{ label: 'Helpdesk', href: '/helpdesk', newTab: false }],
  transparency: [{ label: 'Financial reports', href: '/transparency/financial', newTab: false }],
  ...over,
})
const html = (d: HomeData = data()) => renderToStaticMarkup(HomePage({ data: d }))
const headings = (out: string, tag: string) =>
  [...out.matchAll(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'g'))].map((m) =>
    m[1].replace(/<[^>]+>/g, ''),
  )

describe('front page', () => {
  it('has one h1 with the approved statement and the sections in publication order', () => {
    const out = html(data({ notice: { title: 'Class suspension', href: '/posts/x', date: null } }))
    expect(headings(out, 'h1')).toEqual([
      'Official information, student services and institutional records.',
    ])
    expect(headings(out, 'h2')).toEqual([
      'Official notice',
      'Latest updates',
      'Student services',
      'General plan of activities',
      'Transparency',
      'Latest issuances',
    ])
  })

  it('renders the notice only when there is one', () => {
    expect(html(data({ notice: null }))).not.toContain('Official notice')
    const out = html(
      data({
        notice: {
          title: 'Class <b>suspension</b>',
          href: '/posts/cs',
          date: '2026-11-09T00:00:00.000Z',
        },
      }),
    )
    expect(out).toContain('Official notice')
    expect(out).toContain('href="/posts/cs"')
    expect(out).toContain('Class &lt;b&gt;suspension&lt;/b&gt;')
    expect(out).toContain('9 November 2026')
  })

  it('states honestly when a section is empty and keeps its heading', () => {
    const out = html(
      data({ updates: [], records: [], activities: [], services: [], transparency: [] }),
    )
    for (const text of [
      'No updates have been published yet.',
      'No issuances have been published yet.',
      'No upcoming activities have been published.',
      'No student service links have been published yet.',
      'No transparency links have been published yet.',
    ])
      expect(out).toContain(text)
    expect(headings(out, 'h2')).toHaveLength(5)
  })

  it('omits the records section when no record type has a live route', () => {
    // 4 = updates, services, activities, transparency (no notice, no records).
    const out = html(data({ records: null }))
    expect(out).not.toContain('Latest issuances')
    expect(headings(out, 'h2')).toHaveLength(4)
  })

  it('links only canonical paths and controlled file routes, never # or empty hrefs', () => {
    const out = html()
    expect(out).toContain('href="/posts/consultation-schedule"')
    expect(out).toContain('href="/issuances/memo-17"')
    expect(out).toContain('href="/api/documents/9/file"')
    expect(out).toContain('href="/archives"')
    expect(out).toContain('href="/activities"')
    expect(out).toContain('href="/posts"')
    expect(out).not.toMatch(/href="(#|)"/)
    expect(out).not.toMatch(/storage|sha256/i)
  })

  it('shows publish instants in Manila time and date-only values on their stored day', () => {
    // 17:00 UTC on the 9th is 01:00 on the 10th in Manila.
    const iso = '2026-11-09T17:00:00.000Z'
    const out = html(
      data({
        notice: { title: 'N', href: '/posts/n', date: iso },
        updates: [entry({ date: iso, instant: true })],
        activities: [entry({ key: 'a', date: iso, instant: false, title: 'Dateonly' })],
        records: [],
      }),
    )
    expect([...out.matchAll(/>(\d+ November 2026)<\/time>/g)].map((m) => m[1])).toEqual([
      '10 November 2026',
      '10 November 2026',
      '9 November 2026',
    ])
  })
  it('shows a type tag, date and the right actions on each Latest updates row', () => {
    const out = html()
    const updates = out.slice(out.indexOf('id="home-updates"'), out.indexOf('id="home-services"'))
    expect(updates).toContain('Announcement')
    expect(updates).toContain('Memorandum')
    expect(updates).toMatch(/Read update<span class="sr-only">: Consultation schedule<\/span>/)
    expect(updates).toMatch(/Record<span class="sr-only">: Memo No\. 17<\/span>/)
    expect(updates).toMatch(/href="\/api\/documents\/9\/file"[^>]*>PDF/)
    // A post has no PDF action.
    expect(updates.match(/PDF/g)).toHaveLength(1)
  })

  it('says so honestly when nothing is within the last 30 days', () => {
    const sentence = 'No updates in the last 30 days; showing the most recent.'
    expect(html(data({ updatesFresh: false }))).toContain(sentence)
    expect(html(data({ updatesFresh: true }))).not.toContain(sentence)
    expect(html(data({ updates: [], updatesFresh: false }))).not.toContain(sentence)
  })

  it('opens with the hero image and statement before anything else', () => {
    const out = html(data({ notice: { title: 'N', href: '/posts/n', date: null } }))
    const hero = out.indexOf('id="home-statement"')
    expect(out.indexOf('<img')).toBeGreaterThanOrEqual(0)
    expect(out.indexOf('<img')).toBeLessThan(hero)
    expect(out).toContain('src="/_next/image?url=%2Fbrand%2Fcampus-gate.png')
    expect(out).toMatch(/<img[^>]*alt=""/)
    expect(hero).toBeLessThan(out.indexOf('id="home-notice"'))
    expect(out.indexOf('id="home-notice"')).toBeLessThan(out.indexOf('id="home-updates"'))
  })

  it('escapes record titles as text', () => {
    const out = html(data({ updates: [entry({ title: '<img src=x onerror=alert(1)>' })] }))
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(out).not.toContain('<img src=x')
  })

  it('names new-tab links and protects the opener', () => {
    const out = html(
      data({ services: [{ label: 'Handbook', href: 'https://example.org/h', newTab: true }] }),
    )
    expect(out).toMatch(/<a[^>]*target="_blank"[^>]*rel="noopener noreferrer"/)
    expect(out).toContain('(opens in a new tab)')
  })

  it('uses flat rows: no card surfaces, shadows or raw colors, and only the hero image', () => {
    const out = html(data({ notice: { title: 'N', href: '/posts/n', date: null } }))
    expect(out).not.toMatch(/class="[^"]*\b(card|shadow|rounded-(lg|xl|2xl))/)
    expect(out.match(/<img/g)).toHaveLength(1)
    expect(out).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(/i)
  })

  it('carries no starter copy and no hidden-until-script content', () => {
    const out = html()
    expect(out).not.toMatch(/payload|starter|template/i)
    expect(out).not.toMatch(/opacity-0|display:\s*none|(?<!aria-)hidden/)
  })
})

describe('front page route', () => {
  const root = path.resolve(__dirname, '../..')
  const route = readFileSync(path.join(root, 'src/app/(frontend)/page.tsx'), 'utf8')

  it('is code-owned, per-request and no longer renders the stored home Page or starter', () => {
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect(route).toContain('getHomeData')
    expect(route).not.toMatch(/\[slug\]|homeStatic|home-static/)
  })

  it('adds no loading.tsx, which would stream a fallback past the shell (record-sections note)', () => {
    expect(existsSync(path.join(root, 'src/app/(frontend)/loading.tsx'))).toBe(false)
  })

  it('has an error boundary so a failed read is an error, not an empty page', () => {
    expect(existsSync(path.join(root, 'src/app/(frontend)/error.tsx'))).toBe(true)
  })
})
