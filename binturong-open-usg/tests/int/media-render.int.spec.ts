import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Media } from '@/components/Media'
import type { Media as MediaResource } from '@/payload-types'

const resource: MediaResource = {
  id: 1,
  alt: 'Synthetic image',
  createdAt: '2026-11-21T00:00:00.000Z',
  updatedAt: '2026-11-21T00:00:00.000Z',
  mimeType: 'image/png',
  width: 1024,
  height: 768,
  url: null,
}

describe('media rendering', () => {
  it('omits the image and its frame when the resource has no URL', () => {
    const out = renderToStaticMarkup(React.createElement(Media, { resource }))
    expect(out).toBe('')
  })

  it('renders an image when the resource has a URL', () => {
    const out = renderToStaticMarkup(
      React.createElement(Media, { resource: { ...resource, url: '/api/media/file/example.png' } }),
    )
    expect(out).toContain('<img')
    expect(out).toContain('alt="Synthetic image"')
  })
})
