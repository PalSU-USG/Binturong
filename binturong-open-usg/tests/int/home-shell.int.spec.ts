import { readFileSync } from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const sitemap = vi.fn((entries: unknown) => entries)
vi.mock('next-sitemap', () => ({ getServerSideSitemap: (e: unknown) => sitemap(e) }))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
const find = vi.fn()
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: async () => ({ find }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { GET } from '@/app/(frontend)/(sitemaps)/pages-sitemap.xml/route'
import RootError from '@/app/(frontend)/error'
import { RecordError } from '@/components/records/RecordError'

const root = path.resolve(__dirname, '../..')

describe('pages sitemap', () => {
  it('always lists the front page once, with or without a stored home Page', async () => {
    for (const docs of [[], [{ slug: 'home', updatedAt: '2026-01-01T00:00:00.000Z' }]]) {
      find.mockResolvedValue({ docs })
      sitemap.mockClear()
      await GET()
      const locs = (sitemap.mock.calls[0][0] as { loc: string }[]).map((e) => e.loc)
      expect(locs.filter((loc) => /^https?:\/\/[^/]+\/$/.test(loc))).toHaveLength(1)
    }
  })
})

describe('root error boundary', () => {
  it('uses neutral wording while record routes keep theirs', () => {
    const root_ = renderToStaticMarkup(
      React.createElement(RootError, { error: new Error('x'), reset: vi.fn() }),
    )
    expect(root_).toContain('Something went wrong while loading this page.')
    expect(root_).not.toMatch(/records/i)
    expect(renderToStaticMarkup(React.createElement(RecordError, { reset: vi.fn() }))).toContain(
      'while loading the records',
    )
  })

  it('retries by refreshing the server render inside a transition, then resetting', () => {
    const source = readFileSync(path.join(root, 'src/app/(frontend)/error.tsx'), 'utf8')
    expect(source).toMatch(/startTransition\(\(\) => \{[^}]*router\.refresh\(\)[^}]*reset\(\)/s)
  })
})

describe('layout file', () => {
  it('ends with a newline', () => {
    expect(
      readFileSync(path.join(root, 'src/app/(frontend)/layout.tsx'), 'utf8').endsWith('\n'),
    ).toBe(true)
  })
})
