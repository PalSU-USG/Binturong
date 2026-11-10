import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { authenticatedOrPublished } from '../../access/authenticatedOrPublished'
import { deleteDraftContent } from '@/access/contentAccess'
import { enforceEditorialWrites } from '@/hooks/enforceEditorialWrites'
import { Archive } from '../../blocks/ArchiveBlock/config'
import { CallToAction } from '../../blocks/CallToAction/config'
import { Content } from '../../blocks/Content/config'
import { FormBlock } from '../../blocks/Form/config'
import { MediaBlock } from '../../blocks/MediaBlock/config'
import { hero } from '@/heros/config'
import { slugField } from 'payload'
import { lastEditedByField, setLastEditedBy } from '@/fields/lastEditedBy'
import { plainSlug } from '@/fields/plainSlug'
import { statusPanelComponents } from '@/components/StatusPanel/components'
import { populatePublishedAt } from '../../hooks/populatePublishedAt'
import { generatePreviewPath } from '../../utilities/generatePreviewPath'
import { revalidateDelete, revalidatePage } from './hooks/revalidatePage'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

export const Pages: CollectionConfig<'pages'> = {
  slug: 'pages',
  access: {
    create: authenticated,
    delete: deleteDraftContent,
    read: authenticatedOrPublished,
    readVersions: authenticated,
    update: authenticated,
  },
  // This config controls what's populated by default when a page is referenced
  // https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property
  // Type safe if the collection slug generic is passed to `CollectionConfig` - `CollectionConfig<'pages'>
  defaultPopulate: {
    title: true,
    slug: true,
  },
  labels: { singular: 'Page', plural: 'Pages' },
  admin: {
    group: 'Publish',
    description: 'Standalone pages such as About or Contact.',
    components: statusPanelComponents,
    defaultColumns: ['title', '_status', 'updatedAt'],
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug,
          collection: 'pages',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'pages',
        req,
      }),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Page title',
      admin: { description: 'The heading readers see, for example "About the USG".' },
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [hero],
          label: 'Top banner',
        },
        {
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: [CallToAction, Content, MediaBlock, Archive, FormBlock],
              required: true,
              admin: {
                initCollapsed: true,
              },
            },
          ],
          label: 'Content',
        },
        {
          name: 'meta',
          label: 'Search and sharing',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),

            MetaDescriptionField({}),
            PreviewField({
              // if the `generateUrl` function is configured
              hasGenerateFn: true,

              // field paths to match the target field for data
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'History and advanced',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'publishedAt',
          type: 'date',
          label: 'Date shown to readers',
          admin: {
            date: { pickerAppearance: 'dayAndTime' },
            description:
              'The date readers see on the page. Leave empty to use the day it goes live.',
          },
        },
        slugField({ overrides: plainSlug }),
        lastEditedByField,
      ],
    },
  ],
  hooks: {
    beforeOperation: [enforceEditorialWrites],
    afterChange: [revalidatePage],
    beforeChange: [populatePublishedAt, setLastEditedBy],
    afterDelete: [revalidateDelete],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 100, // We set this interval for optimal live preview
        showSaveDraftButton: true,
      },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
