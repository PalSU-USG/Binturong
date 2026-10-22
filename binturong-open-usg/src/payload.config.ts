import { postgresAdapter } from '@payloadcms/db-postgres'
import sharp from 'sharp'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'
import { Organizations } from './collections/Organizations'
import { AcademicYears } from './collections/AcademicYears'
import { Offices } from './collections/Offices'
import { People } from './collections/People'
import { Activities } from './collections/Activities'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'
import { publishContent } from './access/contentAccess'
import { scheduledPublication } from './jobs/authorizePublication'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    components: {
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below.
      beforeLogin: ['@/components/BeforeLogin'],
      beforeDashboard: ['@/components/BeforeDashboard'],
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
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  collections: [
    Pages,
    Posts,
    Media,
    Categories,
    Users,
    Organizations,
    AcademicYears,
    Offices,
    People,
    Activities,
  ],
  cors: [getServerSideURL()].filter(Boolean),
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
            { name: 'relationTo', type: 'select', options: ['pages', 'posts'] },
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
