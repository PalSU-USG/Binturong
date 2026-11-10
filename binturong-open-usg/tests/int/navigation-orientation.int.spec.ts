import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { SectionIndex } from '@/components/SectionIndex'
import { findSection, type NavItem } from '@/Header/resolveNavigation'

const link = (id: string, label: string, href: string | null) => ({
  id,
  label,
  href,
  newTab: false,
  available: href !== null,
})
const section: NavItem = {
  ...link('u', 'Latest Updates', '/posts'),
  section: 'updates',
  children: [
    link('a', 'All updates', '/posts'),
    link('b', 'Posts archive', '/posts-archive'),
    link('c', 'External', 'https://example.invalid/posts'),
    link('d', 'Pending', null),
  ],
}

describe('Breadcrumbs', () => {
  it('renders_an_ordered_named_landmark_with_the_current_item_as_text', () => {
    const html = renderToStaticMarkup(
      Breadcrumbs({
        items: [
          { label: 'Home', href: '/' },
          { label: 'Latest Updates', href: '/posts' },
          { label: 'Synthetic title' },
        ],
      }),
    )
    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toMatch(/<ol/)
    expect(html).toContain('<a href="/">Home</a>')
    expect(html).toMatch(/<span aria-current="page">Synthetic title<\/span>/)
    expect(html.match(/aria-current/g)).toHaveLength(1)
  })
  it('omits_blank_unsafe_and_unlinked_ancestors_without_inventing_titles', () => {
    const html = renderToStaticMarkup(
      Breadcrumbs({
        items: [
          { label: 'Home', href: '/' },
          { label: '   ', href: '/blank' },
          { label: 'Bad', href: 'javascript:alert(1)' },
          { label: 'Current' },
        ],
      }),
    )
    expect(html).not.toContain('blank')
    expect(html).not.toContain('javascript')
    expect(html).toContain('Current')
  })
  it('renders_nothing_for_an_empty_chain', () => {
    expect(Breadcrumbs({ items: [] })).toBeNull()
  })
})

describe('SectionIndex', () => {
  it('matches_exact_paths_not_prefixes_and_ignores_external_links', () => {
    const html = renderToStaticMarkup(SectionIndex({ section, currentPath: '/posts' }))
    expect(html).toContain('aria-label="Latest Updates section"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-current="page"[^>]*>All updates/)
    expect(html).not.toMatch(/aria-current="page"[^>]*>Posts archive/)
    expect(html).not.toMatch(/aria-current="page"[^>]*>External/)
  })
  it('keeps_current_page_text_when_siblings_do_not_include_it_and_hides_unavailable_live', () => {
    const html = renderToStaticMarkup(
      SectionIndex({ section, currentPath: '/posts/x', currentLabel: 'Synthetic title' }),
    )
    expect(html).toMatch(/aria-current="page">Synthetic title/)
    expect(html).not.toContain('Pending')
    expect(html).not.toContain('Not yet available')
  })
  it('shows_unavailable_children_as_plain_text_in_review', () => {
    const html = renderToStaticMarkup(SectionIndex({ section, currentPath: '/', review: true }))
    expect(html).toContain('Pending')
    expect(html).toContain('Not yet available')
    expect(html).not.toMatch(/<a[^>]*>Pending/)
  })
  it('renders_nothing_without_available_children', () => {
    expect(SectionIndex({ section: { ...section, children: [] }, currentPath: '/' })).toBeNull()
  })
})

describe('findSection', () => {
  it('finds_by_section_identity_not_label', () => {
    expect(findSection([section], 'updates')?.id).toBe('u')
    expect(findSection([{ ...section, label: 'Renamed' }], 'updates')?.label).toBe('Renamed')
    expect(findSection([section], 'archives')).toBeNull()
  })
})
