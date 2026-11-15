import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/blocks/Code/CopyButton', () => ({ CopyButton: () => null }))

import { RenderHero } from '@/heros/RenderHero'
import { syntheticContent } from '../helpers/contentFixtures'

describe('CMS hero beneath a page title', () => {
  it('preserves authored text and demotes its h1 without changing stored content', () => {
    const richText = structuredClone(syntheticContent)
    richText.root.children[0] = { ...richText.root.children[0], type: 'heading', tag: 'h1' }
    const original = structuredClone(richText)
    const html = renderToStaticMarkup(React.createElement(RenderHero, { type: 'lowImpact', richText }))
    expect(html).not.toMatch(/<h1[\s>]/)
    expect(html).toContain('<h2>')
    expect(html).toContain('Synthetic publication fixture.')
    expect(richText).toEqual(original)
  })
})
