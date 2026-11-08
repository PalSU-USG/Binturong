import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import { syntheticContent } from './contentFixtures'

export function richText(text: string) {
  const paragraph = syntheticContent!.root.children[0] as Record<string, unknown>
  const child = (paragraph.children as Record<string, unknown>[])[0]
  return {
    root: {
      ...syntheticContent!.root,
      children: [{ ...paragraph, children: [{ ...child, text }] }],
    },
  }
}

type Created = { collection: 'organizations' | 'documents' | 'issuances' | 'reports'; id: number }

/**
 * Synthetic published Issuances and Reports. Their official publication path is sealed until
 * private storage exists, so rows are written below the hooks and indexed through reindex.
 */
export function createRecordFixtures(payload: Payload) {
  const created: Created[] = []
  let organization: number | undefined
  let file: number | undefined

  async function base() {
    if (organization && file) return { organization, file }
    const org = await payload.db.create({
      collection: 'organizations',
      data: { name: `Synthetic search org ${randomUUID()}`, kind: 'usg', _status: 'published' },
    })
    created.push({ collection: 'organizations', id: org.id as number })
    const doc = await payload.db.create({
      collection: 'documents',
      data: { organization: org.id, title: 'Synthetic sealed file', state: 'pending' },
    })
    created.push({ collection: 'documents', id: doc.id as number })
    organization = org.id as number
    file = doc.id as number
    return { organization, file }
  }

  async function record(
    collection: 'issuances' | 'reports',
    data: {
      title: string
      identifier?: string
      summary?: string
      status?: 'published' | 'draft'
      publishedAt?: string
    },
  ) {
    const { organization, file } = await base()
    const slug = `synthetic-${randomUUID()}`
    const doc = await payload.db.create({
      collection,
      data: {
        title: data.title,
        slug,
        organization,
        mainDocument: file,
        _status: data.status ?? 'published',
        publishedAt: data.publishedAt ?? new Date().toISOString(),
        ...(collection === 'issuances'
          ? {
              type: 'resolution',
              seriesYear: 2026,
              documentNumber: data.identifier,
              normalizedNumber: data.identifier?.toLowerCase(),
              summary: data.summary ? richText(data.summary) : undefined,
            }
          : {
              type: 'financial',
              reportingPeriod: data.identifier ?? 'Synthetic period',
              abstract: data.summary ? richText(data.summary) : undefined,
            }),
      },
    })
    created.push({ collection, id: doc.id as number })
    return { id: doc.id as number, slug }
  }

  async function cleanup() {
    for (const { collection, id } of created.reverse()) {
      if (collection === 'issuances' || collection === 'reports') {
        await payload.delete({
          collection: 'search',
          where: { 'doc.relationTo': { equals: collection }, 'doc.value': { equals: id } },
        })
      }
      await payload.db
        .deleteVersions({ collection, where: { parent: { equals: id } } })
        .catch(() => undefined)
      await payload.db.deleteOne({ collection, where: { id: { equals: id } } })
    }
  }

  return {
    issuance: (d: Parameters<typeof record>[1]) => record('issuances', d),
    report: (d: Parameters<typeof record>[1]) => record('reports', d),
    cleanup,
  }
}
