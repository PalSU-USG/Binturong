import { APIError, commitTransaction, initTransaction, killTransaction } from 'payload'
import { schedulePublishHandler } from '@payloadcms/ui/utilities/schedulePublishHandler'

import { publishContent } from '@/access/contentAccess'
import { getActiveAccount } from '@/access/activeAccount'
import { lockAccounts } from '@/collections/Users/accountProvisioning'
import {
  latestPublicationVersion,
  positiveID,
  serialID,
  validRevisionProof,
  type RevisionProof,
} from './publicationRevision'
import { isDomainCollection } from '@/collections/shared/domainCollections'
import { validateDomainPublication } from '@/collections/shared/validateDomainPublication'

type ScheduleArgs = Parameters<typeof schedulePublishHandler>[0] & { expected?: RevisionProof }
type Schedule = (args: ScheduleArgs) => Promise<{ message: string }>

export const authorizeScheduling: Schedule = async (args) => {
  const ownsTransaction = await initTransaction(args.req)
  const transactionID = await args.req.transactionID
  try {
    await lockAccounts(args.req)
    const result = await schedule(args)
    if (
      !transactionID ||
      (await args.req.transactionID) !== transactionID ||
      !args.req.payload.db.sessions?.[transactionID]
    )
      throw new APIError('The scheduling transaction was aborted', 500)
    if (ownsTransaction) await commitTransaction(args.req)
    return result
  } catch (error) {
    if (ownsTransaction || isDomainCollection(args.doc?.relationTo)) {
      await killTransaction(args.req)
      if (transactionID && args.req.payload.db.sessions?.[transactionID])
        await args.req.payload.db.rollbackTransaction(transactionID)
    }
    throw error
  }
}

export const schedulePublishFromAdmin = async (args: ScheduleArgs) => {
  if (!isDomainCollection(args.doc?.relationTo)) return authorizeScheduling(args)
  try {
    const result = await authorizeScheduling(args)
    return { ...result, confirmed: true }
  } catch (error) {
    const known = error instanceof APIError
    return {
      confirmed: false,
      status: known ? error.status : 500,
      errors: [
        {
          message:
            known && error.isPublic
              ? error.message
              : 'The schedule could not be confirmed. Check scheduled changes before trying again.',
          data: known ? error.data : null,
        },
      ],
    }
  }
}

const schedule: Schedule = async (args) => {
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
    (doc.relationTo !== 'pages' &&
      doc.relationTo !== 'posts' &&
      !isDomainCollection(doc.relationTo)) ||
    (type !== 'publish' && type !== 'unpublish') ||
    !(date instanceof Date) ||
    !Number.isFinite(date.getTime())
  ) {
    throw new APIError('Choose an existing record and a valid publication date', 400)
  }
  const documentID =
    typeof doc.value === 'string' && /^[1-9][0-9]*$/.test(doc.value) ? Number(doc.value) : doc.value
  if (!positiveID(documentID)) throw new APIError('Choose a valid document ID', 400)
  if (isDomainCollection(doc.relationTo) && !serialID(documentID))
    throw new APIError('Choose a valid document ID', 400)
  await req.payload.findByID({
    collection: doc.relationTo,
    id: documentID,
    draft: true,
    depth: 0,
    overrideAccess: false,
    req,
    select: { title: true },
  })
  const collection = doc.relationTo as
    'pages' | 'posts' | import('./publicationRevision').PublicationCollection
  const account = await getActiveAccount(req)
  if (!account) throw new APIError('An active scheduling account is required', 403)
  const reviewed = await latestPublicationVersion(req, collection, documentID)
  if (isDomainCollection(collection)) {
    if (!validRevisionProof(args.expected))
      throw new APIError('Review the saved revision before scheduling it', 400)
    if (reviewed.id !== args.expected.versionID || reviewed.hash !== args.expected.versionHash)
      throw new APIError('The reviewed revision changed. Review it again before scheduling.', 409)
    if (type === 'publish') {
      const canonical = await req.payload.findByID({
        collection,
        id: documentID,
        draft: false,
        depth: 0,
        overrideAccess: false,
        req,
      })
      await validateDomainPublication(req, collection, { ...reviewed.version }, { ...canonical })
    }
  }
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
