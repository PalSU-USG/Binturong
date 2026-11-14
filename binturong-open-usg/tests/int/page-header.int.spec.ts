import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PageHeader } from '@/components/PageHeader'

describe('PageHeader', () => {
  const html = renderToStaticMarkup(
    createElement(PageHeader, {
      crumbs: [
        { label: 'Home', href: '/' },
        { label: 'Section', href: '/s' },
        { label: 'Current' },
      ],
      title: 'Current',
    }),
  )

  it('renders exactly one h1', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
  })

  it('marks only the current breadcrumb item with aria-current', () => {
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toMatch(/<span aria-current="page">Current<\/span>/)
  })
})
