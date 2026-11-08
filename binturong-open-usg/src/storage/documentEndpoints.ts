import { APIError, type Endpoint } from 'payload'
import { serialID } from '@/jobs/publicationRevision'
import {
  beginDocumentUpload,
  finalizeDocumentUpload,
  type BeginDocumentUploadInput,
} from './documentUploads'

export function parseDocumentRouteID(rawId: unknown): number {
  if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId)) {
    throw new APIError('Choose a valid official document', 400)
  }
  const id = Number(rawId)
  if (!serialID(id)) {
    throw new APIError('Choose a valid official document', 400)
  }
  return id
}

export function documentEndpoints(): Endpoint[] {
  return [
    {
      path: '/begin-upload',
      method: 'post',
      handler: async (req) => {
        let body: unknown
        try {
          body = await req.json?.()
        } catch {
          throw new APIError('Enter valid official document upload details', 400)
        }
        const result = await beginDocumentUpload(req, body as BeginDocumentUploadInput)
        return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
      },
    },
    {
      path: '/:id/finalize',
      method: 'post',
      handler: async (req) => {
        const id = parseDocumentRouteID(req.routeParams?.id)
        const result = await finalizeDocumentUpload(req, id)
        return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
      },
    },
  ]
}
