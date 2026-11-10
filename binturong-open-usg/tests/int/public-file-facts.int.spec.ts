import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { readPublicFileFacts, readReadyMainDocuments } from '@/records/publicFileFacts'
import { createRecordSectionFixtures } from '../helpers/recordFixtures'

describe('public file facts', () => {
  let payload: Payload
  let fx: ReturnType<typeof createRecordSectionFixtures>
  let orgId: number

  beforeAll(async () => {
    payload = await getPayload({ config })
    fx = createRecordSectionFixtures(payload)
    orgId = (await fx.org()).id
  })
  afterAll(async () => {
    await fx?.cleanup()
  })

  it('returns_only_the_allow_list_for_a_published_record_with_a_ready_file', async () => {
    const main = await fx.file(orgId, { filename: 'official.pdf', size: 4096 })
    const attachment = await fx.file(orgId, { filename: 'annex.pdf', size: 100 })
    const record = await fx.issuance({
      organization: orgId,
      mainDocument: main,
      attachments: [attachment],
    })
    const facts = await readPublicFileFacts(payload, { collection: 'issuances', id: record.id })
    expect(facts.main).toEqual({
      id: main,
      filename: 'official.pdf',
      size: 4096,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(facts.attachments.map((a) => a.id)).toEqual([attachment])
    expect(Object.keys(facts.main!).sort()).toEqual(['filename', 'id', 'sha256', 'size'])
    const text = JSON.stringify(facts)
    for (const secret of ['storageKey', 'ready/', 'uploadActor', 'stagingKey', 'uploadRequest'])
      expect(text).not.toContain(secret)
  })

  it('denies_draft_only_and_withdrawn_records', async () => {
    const main = await fx.file(orgId)
    const draft = await fx.issuance({ organization: orgId, mainDocument: main, status: 'draft' })
    const withdrawn = await fx.report({ organization: orgId, mainDocument: main, status: 'draft' })
    await fx.version('reports', withdrawn.id, { mainDocument: main })
    for (const [collection, id] of [
      ['issuances', draft.id],
      ['reports', withdrawn.id],
      ['issuances', 999_999_999],
    ] as const)
      expect(await readPublicFileFacts(payload, { collection, id })).toEqual({
        main: null,
        attachments: [],
        versions: [],
      })
  })

  it('omits_files_that_are_not_ready', async () => {
    const main = await fx.file(orgId, { state: 'pending' })
    const failed = await fx.file(orgId, { state: 'failed' })
    const ready = await fx.file(orgId)
    const record = await fx.report({
      organization: orgId,
      mainDocument: main,
      attachments: [failed, ready],
    })
    const facts = await readPublicFileFacts(payload, { collection: 'reports', id: record.id })
    expect(facts.main).toBeNull()
    expect(facts.attachments.map((a) => a.id)).toEqual([ready])
    expect(facts.versions).toEqual([])
  })

  it('never_returns_a_ready_file_that_belongs_to_another_record', async () => {
    const mine = await fx.file(orgId)
    const theirs = await fx.file(orgId, { filename: 'other-record.pdf' })
    await fx.issuance({ organization: orgId, mainDocument: theirs })
    const record = await fx.issuance({ organization: orgId, mainDocument: mine })
    const facts = await readPublicFileFacts(payload, { collection: 'issuances', id: record.id })
    expect(JSON.stringify(facts)).not.toContain('other-record.pdf')
    expect(facts.main?.id).toBe(mine)
  })

  it('lists_only_published_versions_in_a_contiguous_sequence', async () => {
    const first = await fx.file(orgId, { size: 111, verifiedAt: '2026-01-05T00:00:00.000Z' })
    const unpublished = await fx.file(orgId, { previousVersion: first, size: 222 })
    const current = await fx.file(orgId, {
      previousVersion: unpublished,
      size: 333,
      verifiedAt: '2026-03-05T00:00:00.000Z',
    })
    const record = await fx.issuance({ organization: orgId, mainDocument: current })
    await fx.version('issuances', record.id, { mainDocument: first })
    await fx.version('issuances', record.id, { mainDocument: current })
    await fx.version('issuances', record.id, { _status: 'draft', mainDocument: unpublished })
    const { versions } = await readPublicFileFacts(payload, {
      collection: 'issuances',
      id: record.id,
    })
    expect(versions.map((v) => [v.number, v.size, v.current])).toEqual([
      [1, 111, false],
      [2, 333, true],
    ])
    expect(versions[0]!.date).toContain('2026-01-05')
  })

  it('reports_a_single_current_version_when_there_is_no_chain', async () => {
    const main = await fx.file(orgId, { size: 7 })
    const record = await fx.report({ organization: orgId, mainDocument: main })
    const { versions } = await readPublicFileFacts(payload, {
      collection: 'reports',
      id: record.id,
    })
    expect(versions.map((v) => [v.number, v.size, v.current])).toEqual([[1, 7, true]])
  })

  it('maps_only_ready_main_files_of_published_records_in_a_batch', async () => {
    const ready = await fx.file(orgId)
    const pending = await fx.file(orgId, { state: 'pending' })
    const a = await fx.issuance({ organization: orgId, mainDocument: ready })
    const b = await fx.issuance({ organization: orgId, mainDocument: pending })
    const c = await fx.issuance({ organization: orgId, mainDocument: ready, status: 'draft' })
    const map = await readReadyMainDocuments(payload, 'issuances', [a.id, b.id, c.id, 0])
    expect([...map.entries()]).toEqual([[a.id, ready]])
    expect((await readReadyMainDocuments(payload, 'issuances', [])).size).toBe(0)
  })
})
