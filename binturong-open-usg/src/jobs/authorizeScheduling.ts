import { APIError } from 'payload'
import { schedulePublishHandler } from '@payloadcms/ui/utilities/schedulePublishHandler'

import { publishContent } from '@/access/contentAccess'

export const authorizeScheduling: typeof schedulePublishHandler = async (args) => {
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
  await req.payload.findByID({
    collection: doc.relationTo,
    id: doc.value,
    draft: true,
    depth: 0,
    overrideAccess: false,
    req,
    select: { title: true },
  })
  return schedulePublishHandler(args)
}
