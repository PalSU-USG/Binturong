import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, handleEndpoints, type Payload } from 'payload'

import config from '@/payload.config'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'

type Collection =
  'issuances' | 'reports' | 'offices' | 'organizations' | 'academic-years' | 'documents'

describe('record integrity', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const rows: { collection: Collection; id: number }[] = []
  const actor = () => ({ ...fixtures.users.editor, collection: 'users' as const })
  const keep = <T extends { id: number }>(collection: Collection, doc: T): T => {
    rows.push({ collection, id: doc.id })
    return doc
  }
  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    vi.useRealTimers()
    // Exact synthetic parents only; clear their history before dependency-ordered cleanup.
    for (const collection of [
      'issuances',
      'reports',
      'documents',
      'offices',
      'organizations',
      'academic-years',
    ] as const)
      for (const row of rows.filter((row) => row.collection === collection).reverse()) {
        if (collection !== 'documents')
          await payload.db.deleteVersions({ collection, where: { parent: { equals: row.id } } })
        await payload.db.deleteOne({ collection, where: { id: { equals: row.id } } })
      }
    if (fixtures)
      await removeTestAccounts(
        payload,
        Object.values(fixtures.users).map(({ id }) => id),
      )
  })
  async function organization() {
    return keep(
      'organizations',
      await payload.create({
        collection: 'organizations',
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: { name: `Synthetic numbering ${randomUUID()}`, kind: 'usg' },
      }),
    )
  }
  async function issuance(data: Record<string, unknown> = {}) {
    return keep(
      'issuances',
      await payload.create({
        collection: 'issuances',
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: { title: `Synthetic numbering ${randomUUID()}`, ...data },
      }),
    )
  }
  function update(id: number, data: Record<string, unknown>) {
    return payload.update({
      collection: 'issuances',
      id,
      draft: true,
      overrideAccess: false,
      user: actor(),
      data,
    })
  }
  async function expectField(work: Promise<unknown>, path: string) {
    await expect(work).rejects.toMatchObject({
      status: 400,
      data: { errors: expect.arrayContaining([{ path, message: expect.any(String) }]) },
    })
  }

  it('normalizes_exactly_without_losing_punctuation_or_leading_zeros', async () => {
    const { normalizeDocumentNumber: normalize } =
      await import('@/collections/Issuances/normalizeDocumentNumber')
    const { normalizeLegacyDocumentNumber } =
      await import('@/migrations/20261022_110027_record_integrity')
    for (const source of [
      '  EO\t 001-A ',
      '\u2003E\u0301O\u00a0 00İ-A\ufeff',
      '',
      '001',
      '1',
      '001-A',
      '001/A',
      ' \u2028\u2029\u1680\u3000 ',
    ])
      expect(normalizeLegacyDocumentNumber(source)).toBe(normalize(source))
    expect(normalize('  EO\t 001-A ')).toBe('eo 001-a')
    expect(normalize('\u2003E\u0301O\u00a0 00İ-A\ufeff')).toBe('éo 00i\u0307-a')
    expect(normalize('001')).not.toBe(normalize('1'))
    expect(normalize('001-A')).not.toBe(normalize('001/A'))
  })

  it('derives_nullable_keys_preserves_display_and_reserves_equivalent_numbers', async () => {
    const org = await organization()
    const key = { organization: org.id, type: 'memorandum', seriesYear: 2026 }
    const first = await issuance({ ...key, documentNumber: '  E\u0301O\t 001-A ' })
    expect(first.documentNumber).toBe('  E\u0301O\t 001-A ')
    expect(first).toHaveProperty('normalizedNumber', 'éo 001-a')
    await expectField(issuance({ ...key, documentNumber: 'ÉO 001-a' }), 'documentNumber')
    for (const documentNumber of ['ÉO 1-a', 'ÉO 001/a']) await issuance({ ...key, documentNumber })
    for (const data of [{}, { type: 'advisory' }, { ...key, documentNumber: ' \t' }])
      expect(await issuance(data)).toHaveProperty('normalizedNumber', null)
    const incomplete = await issuance({ documentNumber: '001' })
    expect(incomplete).toHaveProperty('normalizedNumber', '001')
    await issuance({ ...key, type: 'act', documentNumber: 'ÉO 001-a' })
    await issuance({ ...key, seriesYear: 2027, documentNumber: 'ÉO 001-a' })
    const other = await organization()
    await issuance({ ...key, organization: other.id, documentNumber: 'ÉO 001-a' })
    await expect(
      update(first.id, { ...key, documentNumber: 'changed', normalizedNumber: 'forged' }),
    ).resolves.toHaveProperty('normalizedNumber', 'changed')
  })

  it('overwrites_forged_and_readonly_form_keys_including_privileged_local_writes', async () => {
    const org = await organization()
    for (const overrideAccess of [false, true]) {
      const data = {
        title: `Synthetic numbering ${randomUUID()}`,
        organization: org.id,
        type: 'act' as const,
        seriesYear: 2026,
        documentNumber: `SOURCE-${overrideAccess}`,
        normalizedNumber: 'forged',
      }
      const doc = keep(
        'issuances',
        await payload.create({
          collection: 'issuances',
          draft: true,
          user: actor(),
          overrideAccess,
          data,
        }),
      )
      expect(doc.normalizedNumber).toBe(`source-${overrideAccess}`)
      const saved = await payload.update({
        collection: 'issuances',
        id: doc.id,
        draft: true,
        user: actor(),
        overrideAccess,
        data: {
          ...data,
          documentNumber: `NEW-${overrideAccess}`,
          normalizedNumber: doc.normalizedNumber,
        },
      })
      expect(saved.normalizedNumber).toBe(`new-${overrideAccess}`)
      await expectField(issuance({ ...data, normalizedNumber: null }), 'documentNumber')
    }
    expect(await issuance({ normalizedNumber: 'forged' })).toHaveProperty('normalizedNumber', null)
  })

  it('rejects_supplied_number_and_year_shapes_before_native_coercion', async () => {
    for (const documentNumber of [true, 42, {}, []])
      await expectField(issuance({ documentNumber }), 'documentNumber')
    for (const seriesYear of [2026.5, 0, -1, '2026', true, {}, []])
      await expectField(issuance({ seriesYear }), 'seriesYear')
    for (const [path, value] of [
      ['seriesYear', '2026'],
      ['documentNumber', 42],
    ] as const) {
      const response = await handleEndpoints({
        config,
        request: new Request('http://localhost/api/issuances?draft=true', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `JWT ${fixtures.tokens.editor}`,
          },
          body: JSON.stringify({ title: 'Synthetic bad number', [path]: value }),
        }),
      })
      expect(response.status).toBe(400)
    }
  })

  it('keeps_canonical_reservations_when_a_newer_draft_changes_the_number', async () => {
    const org = await organization()
    const key = { organization: org.id, type: 'memorandum', seriesYear: 2026 }
    const first = await issuance({ ...key, documentNumber: 'old' })
    await update(first.id, { ...key, documentNumber: 'new' })
    await expectField(issuance({ ...key, documentNumber: 'old' }), 'documentNumber')
    await expectField(issuance({ ...key, documentNumber: 'new' }), 'documentNumber')
    await expect(update(first.id, { ...key, documentNumber: 'old' })).resolves.toMatchObject({
      id: first.id,
    })
  })

  it('ranks_tied_native_versions_before_number_and_slug_collisions_across_many_parents', async () => {
    const org = await organization()
    const key = { organization: org.id, type: 'act', seriesYear: 2026 }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-22T12:00:00.000Z'))
    try {
      const target = `synthetic-tied-${randomUUID()}`
      const parents: number[] = []
      for (let index = 0; index < 4; index++) {
        const doc = await issuance({
          ...key,
          documentNumber: `canonical-${index}`,
          slug: `${target}-canonical-${index}`,
        })
        parents.push(doc.id)
        await expect(
          update(doc.id, { ...key, documentNumber: target, slug: target }),
        ).resolves.toHaveProperty('id')
        await update(doc.id, {
          ...key,
          documentNumber: `released-${index}`,
          slug: `${target}-released-${index}`,
        })
      }
      const live = await issuance({ ...key, documentNumber: target, slug: target })
      const versions = await payload.findVersions({
        collection: 'issuances',
        limit: 0,
        where: { parent: { equals: parents[0] } },
        sort: ['-updatedAt', '-id'],
      })
      expect(versions.docs).toHaveLength(3)
      expect(new Set(versions.docs.map(({ updatedAt }) => updatedAt)).size).toBe(1)
      expect(versions.docs.every(({ latest }) => latest)).toBe(true)
      expect(Number(versions.docs[0].id)).toBeGreaterThan(Number(versions.docs[1].id))
      await expectField(
        issuance({ ...key, documentNumber: target, slug: `${target}-other` }),
        'documentNumber',
      )
      await expectField(
        issuance({ ...key, documentNumber: `${target}-other`, slug: target }),
        'slug',
      )
      await update(live.id, { ...key, documentNumber: `${target}-free`, slug: `${target}-free` })
      // Its first save reserved target canonically, so explicitly remove that fixture reservation.
      await payload.db.pool.query(
        'update issuances set document_number=$1,normalized_number=$1,slug=$1 where id=$2',
        [`${target}-canonical-free`, live.id],
      )
      await expect(
        issuance({ ...key, documentNumber: target, slug: target }),
      ).resolves.toHaveProperty('id')
    } finally {
      vi.useRealTimers()
    }
  }, 20000)

  it('serializes_competing_same_key_saves_with_an_observed_account_lock_wait', async () => {
    const org = await organization()
    const key = {
      organization: org.id,
      type: 'act' as const,
      seriesYear: 2026,
      documentNumber: 'concurrent',
    }
    const req = await createLocalReq({ user: actor() }, payload)
    const transactionID = await payload.db.beginTransaction()
    if (transactionID === null)
      throw new Error('Synthetic concurrency proof requires a transaction')
    req.transactionID = transactionID
    try {
      const first = await payload.create({
        collection: 'issuances',
        draft: true,
        req,
        overrideAccess: false,
        data: { title: `Synthetic concurrent ${randomUUID()}`, ...key },
      })
      keep('issuances', first)
      const competing = issuance(key)
      let waiting = false
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        waiting =
          (
            await payload.db.pool.query(
              "select 1 from pg_stat_activity where datname=current_database() and wait_event='advisory' and pid<>pg_backend_pid()",
            )
          ).rowCount! > 0
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(waiting).toBe(true)
      await payload.db.commitTransaction(await req.transactionID!)
      req.transactionID = undefined
      await expectField(competing, 'documentNumber')
    } finally {
      if (req.transactionID) await payload.db.rollbackTransaction(await req.transactionID)
    }
  })

  it('enforces_native_compound_uniqueness_only_on_canonical_rows', async () => {
    const org = await organization()
    const first = await issuance({
      organization: org.id,
      type: 'act',
      seriesYear: 2026,
      documentNumber: 'sql-key',
    })
    await expect(
      payload.db.pool.query(
        'insert into issuances (organization_id,type,series_year,normalized_number) values ($1,$2,$3,$4)',
        [org.id, 'act', 2026, 'sql-key'],
      ),
    ).rejects.toMatchObject({ code: '23505' })
    await update(first.id, {
      organization: org.id,
      type: 'act',
      seriesYear: 2026,
      documentNumber: 'sql-key',
    })
    const indexes = (
      await payload.db.pool.query(
        "select tablename,indexdef from pg_indexes where tablename in ('issuances','_issuances_v') and indexdef ilike '%normalized_number%'",
      )
    ).rows
    expect(indexes.filter(({ indexdef }) => indexdef.includes('UNIQUE'))).toEqual([
      expect.objectContaining({ tablename: 'issuances' }),
    ])
  })

  it('validates_withdrawal_against_canonical_published_references_only', async () => {
    const { validateDomainWithdrawal } =
      await import('@/collections/shared/protectDomainReferences')
    const org = await organization()
    const other = await organization()
    const sourceOffice = keep(
      'offices',
      await payload.create({
        collection: 'offices',
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: { name: `Synthetic source office ${randomUUID()}`, organization: org.id },
      }),
    )
    const req = await createLocalReq({ user: actor() }, payload)
    for (const collection of ['issuances', 'reports'] as const) {
      const field = collection === 'issuances' ? 'issuingOffice' : 'responsibleOffices'
      const data = {
        title: `Synthetic published reference ${randomUUID()}`,
        organization: org.id,
        [field]: collection === 'issuances' ? sourceOffice.id : [sourceOffice.id],
      }
      const record = keep(
        collection,
        await payload.create({
          collection,
          draft: true,
          overrideAccess: false,
          user: actor(),
          data,
        }),
      )
      await payload.db.pool.query(`update ${collection} set _status='published' where id=$1`, [
        record.id,
      ])
      try {
        await payload.update({
          collection,
          id: record.id,
          draft: true,
          overrideAccess: false,
          user: actor(),
          data: {
            ...data,
            organization: other.id,
            [field]: collection === 'issuances' ? null : [],
          },
        })
        await expect(validateDomainWithdrawal(req, 'organizations', org.id)).rejects.toMatchObject({
          status: 409,
        })
        await expect(
          validateDomainWithdrawal(req, 'offices', sourceOffice.id),
        ).rejects.toMatchObject({ status: 409 })
        await expect(
          validateDomainWithdrawal(req, 'organizations', other.id),
        ).resolves.toBeUndefined()
      } finally {
        await payload.db.pool.query(`update ${collection} set _status='draft' where id=$1`, [
          record.id,
        ])
      }
    }
    await expect(validateDomainWithdrawal(req, 'organizations', org.id)).resolves.toBeUndefined()
    await expect(validateDomainWithdrawal(req, 'offices', sourceOffice.id)).resolves.toBeUndefined()
  })

  it('retains_removed_metadata_and_file_references_in_native_record_history', async () => {
    const { protectDomainReferences } = await import('@/collections/shared/protectDomainReferences')
    const org = await organization()
    const year = keep(
      'academic-years',
      await payload.create({
        collection: 'academic-years',
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: { label: `Synthetic retained year ${randomUUID()}` },
      }),
    )
    const file = keep(
      'documents',
      await payload.db.create({
        collection: 'documents',
        data: {
          title: `Synthetic retained file ${randomUUID()}`,
          organization: org.id,
          state: 'pending',
        },
      }),
    )
    const req = await createLocalReq({ user: actor() }, payload)
    for (const collection of ['issuances', 'reports'] as const) {
      const doc = keep(
        collection,
        await payload.create({
          collection,
          draft: true,
          overrideAccess: false,
          user: actor(),
          data: { title: `Synthetic retained record ${randomUUID()}` },
        }),
      )
      await payload.update({
        collection,
        id: doc.id,
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: {
          organization: org.id,
          academicYear: year.id,
          mainDocument: file.id,
          attachments: [file.id],
        },
      })
      const cleared: Record<string, unknown> = {
        organization: null,
        academicYear: null,
        mainDocument: null,
        attachments: [],
      }
      await payload.update({
        collection,
        id: doc.id,
        draft: true,
        overrideAccess: false,
        user: actor(),
        data: cleared,
      })
    }
    await expect(
      payload.delete({
        collection: 'academic-years',
        id: year.id,
        overrideAccess: false,
        user: { ...fixtures.users.publisher, collection: 'users' },
      }),
    ).rejects.toMatchObject({ status: 409 })
    // Documents are sealed earlier; invoke the reference hook directly to isolate retention.
    const deletion = {
      collection: payload.collections.documents,
      id: file.id,
      req,
      where: { id: { equals: file.id } },
    }
    await expect(
      protectDomainReferences({
        operation: 'delete',
        req,
        overrideAccess: false,
        collection: payload.collections.documents.config,
        context: req.context,
        args: deletion,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
})
