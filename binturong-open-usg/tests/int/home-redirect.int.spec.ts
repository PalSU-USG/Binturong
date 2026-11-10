import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ draft: false, page: null as unknown, find: vi.fn() }))

class Redirected extends Error {
  constructor(public to: string) {
    super(`redirect:${to}`)
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to)
  },
  notFound: () => {
    throw new Error('notFound')
  },
}))
vi.mock('next/headers', () => ({ draftMode: async () => ({ isEnabled: state.draft }) }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: async () => ({ find: state.find }),
}))
vi.mock('@/utilities/getPreviewAccess', () => ({ getPreviewAccess: async () => ({}) }))
vi.mock('@/components/PayloadRedirects', () => ({ PayloadRedirects: () => null }))
vi.mock('@/components/LivePreviewListener', () => ({ LivePreviewListener: () => null }))
vi.mock('@/blocks/RenderBlocks', () => ({ RenderBlocks: () => null }))
vi.mock('@/heros/RenderHero', () => ({ RenderHero: () => null }))
vi.mock('@/utilities/generateMeta', () => ({ generateMeta: async () => ({}) }))
vi.mock('@/app/(frontend)/[slug]/page.client', () => ({ default: () => null }))

import Page from '@/app/(frontend)/[slug]/page'

const render = (slug?: string) => Page({ params: Promise.resolve({ slug }) })

describe('/home', () => {
  beforeEach(() => {
    state.draft = false
    state.find.mockReset()
    state.find.mockResolvedValue({ docs: [] })
  })

  it('redirects_to_the_front_page_for_public_visitors', async () => {
    await expect(render('home')).rejects.toMatchObject({ to: '/' })
    await expect(render()).rejects.toMatchObject({ to: '/' })
  })

  it('redirects_even_when_a_stored_home_page_exists', async () => {
    state.find.mockResolvedValue({ docs: [{ slug: 'home', hero: { type: 'none' }, layout: [] }] })
    await expect(render('home')).rejects.toMatchObject({ to: '/' })
  })

  it('renders_a_stored_home_page_in_draft_mode_for_live_preview', async () => {
    state.draft = true
    state.find.mockResolvedValue({ docs: [{ slug: 'home', hero: { type: 'none' }, layout: [] }] })
    await expect(render('home')).resolves.toBeTruthy()
  })

  it('never_falls_back_to_the_template_home_content', async () => {
    state.draft = true
    // No stored page in draft mode: the redirect-or-404 path runs, not the starter content.
    const out = (await render('home')) as { type?: unknown } | null
    expect(JSON.stringify(out)).not.toMatch(/Payload Website Template|homeStatic/)
  })

  it('does_not_redirect_other_slugs', async () => {
    state.find.mockResolvedValue({ docs: [{ slug: 'about', hero: { type: 'none' }, layout: [] }] })
    await expect(render('about')).resolves.toBeTruthy()
  })
})
