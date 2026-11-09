import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runSearch = vi.fn()
vi.mock('@/search/query', () => ({ runSearch: (...args: unknown[]) => runSearch(...args) }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: async () => ({}),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}))
vi.mock('@/search/Component', () => ({
  Search: ({ q }: { q?: string | null }) => React.createElement('form', null, q ?? ''),
}))
vi.mock('@/app/(frontend)/search/page.client', () => ({ default: () => null }))

import Page from '@/app/(frontend)/search/page'
import { SearchResults } from '@/search/SearchResults'

const hit = {
  label: 'Update',
  title: '<b>Title</b>',
  href: '/posts/a-b',
  identifier: null,
  summary: 'Summary <script>x</script>',
  publishedAt: '2026-11-01T00:00:00.000Z',
  recent: true,
}
const render = (
  q: string,
  type: 'all' | 'updates',
  results: Parameters<typeof SearchResults>[0]['results'],
) => renderToStaticMarkup(React.createElement(SearchResults, { q, type, results }))

describe('search page states', () => {
  beforeEach(() => {
    runSearch.mockReset()
  })

  it('renders_the_prompt_without_running_a_query', async () => {
    for (const q of [undefined, '', 'a', ['x']]) {
      const html = renderToStaticMarkup(
        await Page({ searchParams: Promise.resolve(q === undefined ? {} : { q }) }),
      )
      expect(html).toContain('Enter at least two characters')
    }
    expect(runSearch).not.toHaveBeenCalled()
  })

  it('passes_normalized_parameters_to_the_query', async () => {
    runSearch.mockResolvedValue({ hits: [], totalDocs: 0, totalPages: 0, page: 1 })
    await Page({ searchParams: Promise.resolve({ q: [' ab  cd ', 'zz'], type: 'bad', page: '0' }) })
    expect(runSearch).toHaveBeenCalledWith({}, { q: 'ab cd', type: 'all', page: 1 })
  })

  it('propagates_a_failed_query_so_the_error_boundary_renders_instead_of_no_results', async () => {
    runSearch.mockImplementation(async () => {
      throw new Error('Synthetic outage')
    })
    const outcome = await Page({ searchParams: Promise.resolve({ q: 'abc' }) }).then(
      () => 'rendered',
      (error: Error) => error.message,
    )
    expect(outcome).toBe('Synthetic outage')
  })

  it('escapes_markup_and_encodes_pagination_links', () => {
    const html = render('a&b <i>', 'updates', {
      hits: [hit],
      totalDocs: 30,
      totalPages: 3,
      page: 2,
    })
    expect(html).not.toContain('<b>Title</b>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;b&gt;Title&lt;/b&gt;')
    expect(html).toContain('href="/search?q=a%26b+%3Ci%3E&amp;type=updates"')
    expect(html).toContain('href="/search?q=a%26b+%3Ci%3E&amp;type=updates&amp;page=3"')
    expect(html).toContain('Recent')
  })

  it('offers_page_one_when_past_the_end_and_names_the_query_when_empty', () => {
    const past = render('abc', 'all', { hits: [], totalDocs: 5, totalPages: 1, page: 9 })
    expect(past).toContain('href="/search?q=abc"')
    const none = render('abc', 'all', { hits: [], totalDocs: 0, totalPages: 0, page: 1 })
    expect(none).toContain('No results for')
    expect(none).toContain('href="/posts"')
  })
})
