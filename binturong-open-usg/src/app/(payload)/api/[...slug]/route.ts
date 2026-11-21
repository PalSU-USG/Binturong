/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from '@payload-config'
import '@payloadcms/next/css'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'

// Added by hand (kept by tests/int/download-duration.int.spec.ts): official file downloads
// (GET /api/documents/:id/file) are served here and may take minutes. 300 s is the Vercel Hobby
// maximum; it applies to every Payload REST route in this file. See docs/production-runbook.md.
export const maxDuration = 300

export const GET = REST_GET(config)
export const POST = REST_POST(config)
export const DELETE = REST_DELETE(config)
export const PATCH = REST_PATCH(config)

export const PUT = REST_PUT(config)
export const OPTIONS = REST_OPTIONS(config)
