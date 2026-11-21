import { postgresAdapter } from '@payloadcms/db-postgres'
import sharp from 'sharp'
import path from 'path'
import { buildConfig, type CollectionConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'
import { AccessRequests } from './collections/AccessRequests'
import { Organizations } from './collections/Organizations'
import { AcademicYears } from './collections/AcademicYears'
import { Offices } from './collections/Offices'
import { People } from './collections/People'
import { Activities } from './collections/Activities'
import { Documents } from './collections/Documents'
import { Issuances } from './collections/Issuances'
import { Reports } from './collections/Reports'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { adminCopy } from './admin/copy'
import { installGoogleSessionEndpoints } from './auth/supabaseStrategy'
import { hiddenBelow } from './admin/navVisibility'
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'
import { databasePool } from './utilities/databasePool'
import { publishContent } from './access/contentAccess'
import { scheduledPublication } from './jobs/authorizePublication'
import { domainCollections } from './collections/shared/domainCollections'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const draftCollections: string[] = ['pages', 'posts', ...domainCollections]
/** Lists of drafts collections open with "All | Not live yet | Live" links and their counts. */
const withStateLinks = (collection: CollectionConfig): CollectionConfig =>
  draftCollections.includes(collection.slug)
    ? {
        ...collection,
        admin: {
          ...collection.admin,
          components: {
            ...collection.admin?.components,
            beforeListTable: [
              '@/admin/stateLinks',
              ...(collection.admin?.components?.beforeListTable ?? []),
            ],
          },
        },
      }
    : collection

export default buildConfig({
  admin: {
    components: {
      actions: ['@/admin/viewSite'],
      graphics: { Logo: '@/admin/graphics/Logo', Icon: '@/admin/graphics/Icon' },
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below.
      beforeLogin: ['@/components/BeforeLogin'],
      afterLogin: ['@/admin/GoogleSignIn'],
      views: {
        dashboard: { Component: '@/admin/dashboard' },
        howTo: { Component: '@/admin/howTo', path: '/how-to', exact: true },
      },
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
        {
          label: 'Tablet',
          name: 'tablet',
          width: 768,
          height: 1024,
        },
        {
          label: 'Desktop',
          name: 'desktop',
          width: 1440,
          height: 900,
        },
      ],
    },
  },
  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,
  db: postgresAdapter({
    push: false,
    pool: databasePool(),
  }),
  folders: {
    collectionOverrides: [
      ({ collection }) => ({
        ...collection,
        admin: { ...collection.admin, group: 'Advanced', hidden: hiddenBelow('super_admin') },
      }),
    ],
  },
  collections: [
    // Order sets the order of the admin menu groups: Publish, Records, People & Offices, Site, Accounts.
    Pages,
    Posts,
    Activities,
    Documents,
    Issuances,
    Reports,
    AcademicYears,
    People,
    Offices,
    Organizations,
    Media,
    Categories,
    Users,
    AccessRequests,
  ].map(withStateLinks),
  cors: [getServerSideURL()].filter(Boolean),
  // Heading of Payload's no-access page, shown only to a signed-in account that lost access.
  // Payload's own labels use the admin word set ("Not live yet", "Live on the site").
  i18n: {
    translations: {
      en: {
        error: { unauthorizedAdmin: adminCopy.accountDisabled },
        general: { createNew: adminCopy.createNew, updatedAt: adminCopy.lastSaved },
        version: { draft: adminCopy.stateNotLive, published: adminCopy.statusPublished },
      },
    },
  },
  globals: [Header, Footer],
  plugins,
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    access: {
      queue: async ({ req }) => Boolean(await publishContent({ req })),
      cancel: async ({ req }) => Boolean(await publishContent({ req })),
      run: async ({ req }: { req: PayloadRequest }): Promise<boolean> => {
        if (req.user) return Boolean(await publishContent({ req }))

        const secret = process.env.CRON_SECRET
        if (!secret) return false

        const authHeader = req.headers.get('authorization')
        return authHeader === `Bearer ${secret}`
      },
    },
    tasks: [],
  },
}).then((config) => {
  installGoogleSessionEndpoints(config)
  // Payload appends this task during sanitization; replace its handler without registering a duplicate.
  const tasks = config.jobs.tasks?.filter(({ slug }) => slug === 'schedulePublish')
  if (tasks?.length !== 1) throw new Error('Expected one native publication task')
  tasks[0].handler = scheduledPublication
  // The native drawer and upcoming-schedule query persist string IDs in this JSON locator.
  tasks[0].inputSchema = tasks[0].inputSchema?.map((field) =>
    'name' in field && field.name === 'doc'
      ? {
          name: 'doc',
          type: 'group',
          fields: [
            {
              name: 'relationTo',
              type: 'select',
              options: ['pages', 'posts', ...domainCollections],
            },
            { name: 'value', type: 'text' },
          ],
        }
      : field,
  )
  tasks[0].inputSchema?.push(
    ...['accountID', 'documentID', 'versionID', 'appliedVersionID'].map((name) => ({
      name,
      type: 'number' as const,
    })),
    ...['collection', 'versionHash', 'appliedVersionHash', 'timezone'].map((name) => ({
      name,
      type: 'text' as const,
    })),
  )
  return config
})
