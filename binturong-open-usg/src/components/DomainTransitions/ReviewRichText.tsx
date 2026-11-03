import React from 'react'
import { RichText, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'
import type { DefaultTypedEditorState } from '@payloadcms/richtext-lexical'

const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  link: (args) => {
    const { doc, linkType } = args.node.fields
    if (linkType !== 'internal') {
      const nativeLink = defaultConverters.link
      return typeof nativeLink === 'function' ? nativeLink(args) : nativeLink
    }
    const id = typeof doc?.value === 'object' ? doc.value?.id : doc?.value
    return (
      <span>
        {args.nodesToJSX({ nodes: args.node.children })} (
        {doc && id != null ? `${doc.relationTo}: record ${id}` : 'Internal target not supplied'})
      </span>
    )
  },
})

export function ReviewRichText({ data }: { data: DefaultTypedEditorState }) {
  return <RichText data={data} converters={converters} />
}
