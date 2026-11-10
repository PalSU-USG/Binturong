import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { matchPath } from '@/Header/currentPath'

const state = vi.hoisted(() => ({ review: false, read: vi.fn() }))
vi.mock('next/headers', () => ({ draftMode: async () => ({ isEnabled: state.review }) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/government/offices' }))
vi.mock('@/utilities/getGlobals', () => ({ getCachedGlobal: () => state.read }))

import { HeaderNavigation } from '@/Header/Navigation'

const render = async () => renderToStaticMarkup(await HeaderNavigation())
const custom = (id: string, label: string, url: string) => ({
  id,
  link: { type: 'custom', label, url },
})

describe('current path matching', () => {
  it.each([
    ['/government', '/government', 'page'],
    ['/government/', '/government', 'page'],
    ['/government?x=1#y', '/government', 'page'],
    ['/government', '/government/offices', 'section'],
    ['/gov', '/government', null],
    ['/', '/', 'page'],
    ['/', '/government', null],
    ['https://example.invalid/government', '/government', null],
    ['//evil.example/government', '/government', null],
    [null, '/government', null],
    ['/government', null, null],
  ])('%s against %s is %s', (href, path, expected) => {
    expect(matchPath(href as string | null, path as string | null)).toBe(expected)
  })
})

describe('header navigation states', () => {
  beforeEach(() => {
    state.review = false
    state.read.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('renders_every_eligible_link_in_server_html_with_current_markers', async () => {
    state.read.mockResolvedValue({
      navItems: [
        {
          ...custom('g', 'Government', '/government'),
          section: 'government',
          children: [custom('o', 'Offices', '/government/offices')],
        },
      ],
    })
    const html = await render()
    expect(html).toContain('aria-label="Primary"')
    expect(html).toContain('href="/government/offices"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('data-section-current="true"')
    expect(html).toContain('Show Government links')
    expect(html).not.toContain('href="#"')
  })

  it('shows_unavailable_destinations_as_plain_text_only_in_review', async () => {
    state.read.mockResolvedValue({
      navItems: [
        custom('a', 'Available', '/available'),
        {
          id: 'u',
          link: {
            type: 'reference',
            label: 'Archives',
            reference: { relationTo: 'pages', value: 7 },
          },
        },
      ],
    })
    expect(await render()).not.toContain('Archives')
    state.review = true
    const html = await render()
    expect(html).toContain('Archives')
    expect(html).toContain('Not yet available')
    expect(html).not.toMatch(/<a[^>]*>\s*Archives/)
  })

  it('empty_configuration_is_not_an_error', async () => {
    state.read.mockResolvedValue({ navItems: [] })
    const html = await render()
    expect(html).toContain('Home')
    expect(html).toContain('Search')
    expect(html).not.toContain('unavailable')
  })

  it('failed_reads_keep_a_minimal_shell_and_say_so_without_leaking_details', async () => {
    state.read.mockRejectedValue(new Error('secret-connection-string'))
    const html = await render()
    expect(html).toContain('href="/"')
    expect(html).toContain('href="/search"')
    expect(html).toContain('Navigation is unavailable')
    expect(html).not.toContain('secret-connection-string')
    expect(console.error).toHaveBeenCalled()
  })
})
