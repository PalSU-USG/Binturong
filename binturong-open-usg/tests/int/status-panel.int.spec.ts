import { describe, expect, it } from 'vitest'

import { adminCopy } from '@/admin/copy'
import { describeStatus } from '@/components/StatusPanel/statusText'

describe('status panel wording', () => {
  it('says a never-published draft is not live', () => {
    expect(describeStatus({ status: 'draft', hasPublishedDoc: false })).toBe(adminCopy.statusDraft)
  })
  it('says saved changes to a live item are not live yet', () => {
    expect(describeStatus({ status: 'draft', hasPublishedDoc: true })).toBe(adminCopy.statusChanged)
  })
  it('says a withdrawn item was live and is now hidden', () => {
    expect(
      describeStatus({ status: 'draft', hasPublishedDoc: false, lastAction: 'withdraw' }),
    ).toBe(adminCopy.statusWithdrawn)
  })
  it('shows the live date when there is one', () => {
    const text = describeStatus({
      status: 'published',
      hasPublishedDoc: true,
      publishedAt: '2026-03-04T00:00:00.000Z',
    })
    expect(text).toContain(adminCopy.statusPublished)
    expect(text).toMatch(/2026/)
    expect(describeStatus({ status: 'published', hasPublishedDoc: true })).toBe(
      adminCopy.statusPublished,
    )
  })
  it('treats an unknown status as not live rather than live', () => {
    expect(describeStatus({ status: undefined, hasPublishedDoc: false })).toBe(
      adminCopy.statusDraft,
    )
  })
})
