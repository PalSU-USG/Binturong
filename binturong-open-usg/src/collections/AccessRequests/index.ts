import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type CollectionConfig,
  type PayloadRequest,
} from 'payload'

import { getActiveAccount } from '@/access/activeAccount'
import { hasRole } from '@/access/roles'
import { hiddenBelow } from '@/admin/navVisibility'
import { createGoogleStaff, findStaffAccount } from '@/auth/staffAccount'
import { lockAccounts } from '@/collections/Users/accountProvisioning'
import { serialID } from '@/jobs/publicationRevision'

async function inAccountTransaction<T>(req: PayloadRequest, action: () => Promise<T>) {
  const ownsTransaction = await initTransaction(req)
  try {
    await lockAccounts(req)
    const result = await action()
    if (ownsTransaction) await commitTransaction(req)
    return result
  } catch (error) {
    if (ownsTransaction) await killTransaction(req)
    throw error
  }
}

export async function recordStaffAccessRequest(
  req: PayloadRequest,
  identity: { email: string; name: string | null },
) {
  return inAccountTransaction(req, async () => {
    const staff = await findStaffAccount(req.payload, identity.email, req)
    if (staff.status !== 'unknown') return staff.status

    const { docs } = await req.payload.find({
      collection: 'access-requests',
      where: { email: { equals: identity.email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (!docs.length) {
      await req.payload.create({
        collection: 'access-requests',
        data: { email: identity.email, name: identity.name, requestedAt: new Date().toISOString() },
        overrideAccess: true,
        req,
      })
    }
    return 'requested' as const
  })
}

const canReview = async ({ req }: { req: PayloadRequest }) =>
  hasRole((await getActiveAccount(req))?.role, 'admin')

export const AccessRequests: CollectionConfig<'access-requests'> = {
  slug: 'access-requests',
  access: { create: () => false, update: () => false, read: canReview, delete: canReview },
  admin: {
    group: 'Accounts',
    hidden: hiddenBelow('admin'),
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'requestedAt'],
    components: { edit: { beforeDocumentControls: ['@/admin/ApproveAccessRequest'] } },
  },
  fields: [
    { name: 'email', type: 'email', required: true, unique: true },
    { name: 'name', type: 'text', maxLength: 160 },
    { name: 'requestedAt', type: 'date', required: true },
  ],
  endpoints: [
    {
      path: '/:id/approve',
      method: 'post',
      handler: async (req) => {
        if (!(await canReview({ req }))) throw new APIError('Admin access is required', 403)
        const id = Number(req.routeParams?.id)
        if (!serialID(id)) throw new APIError('Choose a valid access request', 400)
        let role: unknown
        try {
          if (req.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
            throw new Error('JSON required')
          role = (await req.json?.())?.role
        } catch {
          throw new APIError('Choose Editor or Publisher', 400)
        }
        if (role !== 'editor' && role !== 'publisher')
          throw new APIError('Choose Editor or Publisher', 400)
        const account = await inAccountTransaction(req, async () => {
          const request = await req.payload.findByID({
            collection: 'access-requests',
            id,
            depth: 0,
            overrideAccess: false,
            req,
          })
          const created = await createGoogleStaff(req, {
            email: request.email,
            name: request.name,
            role,
          })
          await req.payload.delete({
            collection: 'access-requests',
            id,
            overrideAccess: false,
            req,
          })
          return created
        })
        return Response.json({ id: account.id }, { status: 201 })
      },
    },
  ],
}
