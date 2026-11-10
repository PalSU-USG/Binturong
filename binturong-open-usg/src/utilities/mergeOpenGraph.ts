import type { Metadata } from 'next'

export const siteName = 'Palawan State University / University Student Government'
export const siteDescription = 'Official information, student services and institutional records.'

// No default share image: none has been approved. Add one here when the owner supplies it.
const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  description: siteDescription,
  siteName,
  title: siteName,
}

export const mergeOpenGraph = (og?: Metadata['openGraph']): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : undefined,
  }
}
