import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DefaultTypedEditorState, SerializedLinkNode } from '@payloadcms/richtext-lexical'
import { ReviewRichText } from '@/components/DomainTransitions/ReviewRichText'

const description = (fields: SerializedLinkNode['fields']): DefaultTypedEditorState => ({
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children: [
      {
        type: 'paragraph',
        version: 1,
        textFormat: 0,
        format: '',
        indent: 0,
        direction: null,
        children: [
          {
            type: 'link',
            version: 3,
            format: '',
            indent: 0,
            direction: null,
            fields,
            children: [
              {
                type: 'text',
                version: 1,
                text: 'Read the announcement',
                format: 1,
                detail: 0,
                mode: 'normal',
                style: '',
              },
            ],
          },
        ],
      },
    ],
  },
})
const render = (fields: SerializedLinkNode['fields']) =>
  renderToStaticMarkup(createElement(ReviewRichText, { data: description(fields) }))

describe('saved domain rich-text review', () => {
  it.each(['pages', 'posts'])(
    'distinguishes exact saved %s targets with identical link labels',
    (relationTo) => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        const first = render({
          linkType: 'internal',
          newTab: false,
          doc: { relationTo, value: 101 },
        })
        const second = render({
          linkType: 'internal',
          newTab: false,
          doc: { relationTo, value: 202 },
        })
        expect(first).not.toBe(second)
        expect(first).toContain(`${relationTo}: record 101`)
        expect(second).toContain(`${relationTo}: record 202`)
        expect(first).toContain('<strong>Read the announcement</strong>')
        expect(first).not.toContain('href=')
        expect(errors).not.toHaveBeenCalled()
      } finally {
        errors.mockRestore()
      }
    },
  )

  it('shows saved identity even if a populated target contains a different slug', () => {
    const output = render({
      linkType: 'internal',
      newTab: false,
      doc: { relationTo: 'posts', value: { id: 101, slug: 'unreviewed-newer-slug' } },
    })
    expect(output).toContain('posts: record 101')
    expect(output).not.toContain('unreviewed-newer-slug')
    expect(output).not.toContain('href=')
  })

  it('makes a missing internal target explicit', () => {
    expect(render({ linkType: 'internal', newTab: false, doc: null })).toContain(
      'Internal target not supplied',
    )
  })

  it('preserves native external link formatting and new-tab protections', () => {
    const output = render({
      linkType: 'custom',
      url: 'https://example.invalid/saved',
      newTab: true,
    })
    expect(output).toContain('href="https://example.invalid/saved"')
    expect(output).toContain('target="_blank"')
    expect(output).toContain('rel="noopener noreferrer"')
    expect(output).toContain('<strong>Read the announcement</strong>')
  })
})
