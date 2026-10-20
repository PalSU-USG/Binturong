import { APIError, commitTransaction, initTransaction, killTransaction } from 'payload'
import { schedulePublishHandler } from '@payloadcms/ui/utilities/schedulePublishHandler'

import { publishContent } from '@/access/contentAccess'
import { getActiveAccount } from '@/access/activeAccount'
import { lockAccounts } from '@/collections/Users/accountProvisioning'
import { latestPublicationVersion, positiveID } from './authorizePublication'

export const authorizeScheduling: typeof schedulePublishHandler = async (args) => {
  const ownsTransaction = await initTransaction(args.req)
  try {
    await lockAccounts(args.req)
    const result = await schedule(args)
    if (ownsTransaction) await commitTransaction(args.req)
    return result
  } catch (error) {
    if (ownsTransaction) await killTransaction(args.req)
    throw error
  }
}

const schedule: typeof schedulePublishHandler = async (args) => {
  const { req, doc, global, type, date } = args
  if (!(await publishContent({ req }))) throw new APIError('Publishing permission is required', 403)
  if (args.deleteID) {
    const job = await req.payload.findByID({
      collection: 'payload-jobs',
      id: args.deleteID,
      depth: 0,
      req,
    })
    if (job.taskSlug !== 'schedulePublish') throw new APIError('Not a publication schedule', 400)
    if (job.processing || job.completedAt)
      throw new APIError('This schedule has already started; check the current document', 409)
    // The native cancellation handler also queues an empty job; cancel only the verified schedule.
    await req.payload.delete({ collection: 'payload-jobs', id: job.id, req })
    return { message: req.i18n.t('general:success') }
  }
  if (
    global ||
    !doc ||
    (doc.relationTo !== 'pages' && doc.relationTo !== 'posts') ||
    (type !== 'publish' && type !== 'unpublish') ||
    !(date instanceof Date) ||
    !Number.isFinite(date.getTime())
  ) {
    throw new APIError('Choose an existing page or post and a valid publication date', 400)
  }
  const documentID =
    typeof doc.value === 'string' && /^[1-9][0-9]*$/.test(doc.value) ? Number(doc.value) : doc.value
  if (!positiveID(documentID)) throw new APIError('Choose a valid document ID', 400)
  await req.payload.findByID({
    collection: doc.relationTo,
    id: documentID,
    draft: true,
    depth: 0,
    overrideAccess: false,
    req,
    select: { title: true },
  })
  const account = await getActiveAccount(req)
  if (!account) throw new APIError('An active scheduling account is required', 403)
  const reviewed = await latestPublicationVersion(req, doc.relationTo, documentID)
  await req.payload.jobs.queue({
    task: 'schedulePublish',
    waitUntil: date,
    req,
    overrideAccess: false,
    input: {
      type,
      doc: { relationTo: doc.relationTo, value: String(documentID) },
      locale: args.localeToPublish,
      timezone: args.timezone,
      user: { relationTo: 'users', value: account.id },
      accountID: account.id,
      collection: doc.relationTo,
      documentID,
      versionID: reviewed.id,
      versionHash: reviewed.hash,
    },
  })
  return { message: req.i18n.t('general:success') }
}
