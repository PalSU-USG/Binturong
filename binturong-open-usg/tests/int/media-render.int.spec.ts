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

  it('plays a video from its served URL, not from the local public folder', () => {
    // With cloud storage, public/media is empty; the file is only reachable through its URL.
    const video = { ...resource, mimeType: 'video/mp4', filename: 'clip.mp4' }
    const out = renderToStaticMarkup(
      React.createElement(Media, { resource: { ...video, url: '/api/media/file/clip.mp4' } }),
    )
    expect(out).toContain('<source src="/api/media/file/clip.mp4"')
    expect(renderToStaticMarkup(React.createElement(Media, { resource: video }))).not.toContain(
      '<source',
    )
  })
})
