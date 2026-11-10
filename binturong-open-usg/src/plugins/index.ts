import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { Plugin } from 'payload'
import { hiddenBelow } from '@/admin/navVisibility'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'
import { getActiveAccount } from '@/access/activeAccount'
import { publishContent } from '@/access/contentAccess'
import { hasRole } from '@/access/roles'
import { protectSearchReindex, trustedSearchWrite } from '@/search/authorizeReindex'
import { publishedSearchAccess } from '@/search/publishedSearchAccess'
import { indexedCollections } from '@/search/searchTargets'

import { Page, Post } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | Payload Website Template` : 'Payload Website Template'
}

const generateURL: GenerateURL<Post | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

export const plugins: Plugin[] = [
  redirectsPlugin({
    collections: ['pages', 'posts'],
    overrides: {
      admin: { group: 'Advanced', hidden: hiddenBelow('admin') },
      access: { create: publishContent, update: publishContent, delete: publishContent },
      // @ts-expect-error - This is a valid override, mapped fields don't resolve to the same type
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'from') {
            return {
              ...field,
              admin: {
                description: 'You will need to rebuild the website when changing this field.',
              },
            }
          }
          return field
        })
      },
      hooks: {
        afterChange: [revalidateRedirects],
      },
    },
  }),
  nestedDocsPlugin({
    collections: ['categories'],
    generateURL: (docs) => docs.reduce((url, doc) => `${url}/${doc.slug}`, ''),
  }),
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
    },
    formOverrides: {
      admin: { group: 'Advanced', hidden: hiddenBelow('admin') },
      access: { create: publishContent, update: publishContent, delete: publishContent },
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  ]
                },
              }),
            }
          }
          return field
        })
      },
    },
    formSubmissionOverrides: {
      admin: { group: 'Advanced', hidden: hiddenBelow('super_admin') },
      access: {
        create: () => true,
        read: async ({ req }) => hasRole((await getActiveAccount(req))?.role, 'super_admin'),
        update: () => false,
        delete: async ({ req }) => hasRole((await getActiveAccount(req))?.role, 'super_admin'),
      },
    },
  }),
  searchPlugin({
    collections: indexedCollections,
    beforeSync: beforeSyncWithSearch,
    searchOverrides: {
      admin: { group: 'Advanced', hidden: hiddenBelow('super_admin') },
      access: {
        create: trustedSearchWrite,
        update: trustedSearchWrite,
        delete: trustedSearchWrite,
        read: publishedSearchAccess,
      },
      fields: ({ defaultFields }) => {
        return [...defaultFields, ...searchFields]
      },
    },
  }),
  protectSearchReindex,
]
