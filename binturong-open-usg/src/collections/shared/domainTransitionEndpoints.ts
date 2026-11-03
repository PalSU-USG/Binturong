import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type Endpoint,
} from 'payload'
import { getActiveAccount } from '@/access/activeAccount'
import { lockAccounts } from '@/collections/Users/accountProvisioning'
import { latestPublicationVersion, serialID } from '@/jobs/publicationRevision'
import type { DomainCollection } from './domainCollections'
import { historicalDomainVersion, transitionDomainRecord } from './transitionDomainRecord'

export function domainTransitionEndpoints(collection: DomainCollection): Endpoint[] {
  return [
    {
      path: '/:id/review',
      method: 'get',
      handler: async (req) => {
        const ownsTransaction = await initTransaction(req)
        try {
          await lockAccounts(req)
          if (!(await getActiveAccount(req)))
            throw new APIError('An active staff account is required', 403)
          const id = Number(req.routeParams?.id)
          if (!serialID(id)) throw new APIError('Choose a valid record', 400)
          const head = await latestPublicationVersion(req, collection, id)
          const selected = new URL(req.url!).searchParams.get('versionID')
          const versionID = selected === null ? undefined : Number(selected)
          if (versionID !== undefined && !serialID(versionID))
            throw new APIError('Choose a valid historical version', 400)
          const reviewed = versionID
            ? await historicalDomainVersion(req, collection, id, versionID)
            : head
          const canonical = await req.payload.findByID({
            collection,
            id,
            draft: false,
            depth: 0,
            overrideAccess: false,
            req,
          })
          const { lastTransition: _audit, ...candidate } = reviewed.version
          const versions = await req.payload.findVersions({
            collection,
            req,
            overrideAccess: false,
            depth: 0,
            limit: 0,
            sort: ['-updatedAt', '-id'],
            where: { parent: { equals: id } },
            select: { createdAt: true, updatedAt: true },
          })
          const result = {
            candidate: { ...candidate, id },
            expected: { versionID: head.id, versionHash: head.hash },
            reviewed: { versionID: reviewed.id, versionHash: reviewed.hash },
            published: canonical._status === 'published',
            withdrawalCandidate: { ...canonical, lastTransition: undefined },
            versions: versions.docs.map(({ id, createdAt, updatedAt }) => ({
              id,
              createdAt,
              updatedAt,
            })),
          }
          if (ownsTransaction) await commitTransaction(req)
          return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
        } catch (error) {
          if (ownsTransaction) await killTransaction(req)
          throw error
        }
      },
    },
    {
      path: '/:id/transition',
      method: 'post',
      handler: async (req) => {
        let body: unknown
        try {
          body = await req.json?.()
        } catch {
          throw new APIError('Enter a valid transition request', 400)
        }
        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).some((key) => !['action', 'expected', 'restore'].includes(key))
        )
          throw new APIError('Enter an action and reviewed revision', 400)
        const result = await transitionDomainRecord(req, {
          ...body,
          collection,
          documentID: Number(req.routeParams?.id),
        } as Parameters<typeof transitionDomainRecord>[1])
        return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
      },
    },
  ]
}
