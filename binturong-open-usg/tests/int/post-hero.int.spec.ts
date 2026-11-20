import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PostHero } from '@/heros/PostHero'
import type { Post } from '@/payload-types'

const post: Post = {
  id: 1,
  title: 'Synthetic update',
  slug: 'synthetic-update',
  content: {
    root: {
      type: 'root',
      children: [],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  },
  createdAt: '2026-10-10T18:30:00.000Z',
  updatedAt: '2026-10-10T18:30:00.000Z',
  publishedAt: '2026-10-10T18:30:00.000Z',
}

describe('post hero', () => {
  it('shows the Manila calendar date in long form', () => {
    const out = renderToStaticMarkup(React.createElement(PostHero, { post }))
    expect(out).toContain('11 October 2026</time>')
    expect(out).not.toContain('10/11/2026')
  })

  it('omits the hero image frame when its media has no URL', () => {
    const heroImage = {
      id: 1,
      url: null,
      width: 1024,
      height: 768,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    }
    const out = renderToStaticMarkup(React.createElement(PostHero, { post: { ...post, heroImage } }))
    expect(out).toBe(renderToStaticMarkup(React.createElement(PostHero, { post })))
  })
})
