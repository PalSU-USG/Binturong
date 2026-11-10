import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import { richText } from './searchFixtures'

type Slug =
  | 'organizations'
  | 'offices'
  | 'academic-years'
  | 'documents'
  | 'issuances'
  | 'reports'
  | 'activities'
  | 'people'
  | 'posts'
  | 'categories'
type Status = 'published' | 'draft'
type Data = Record<string, unknown>

export { richText }

/**
 * Synthetic rows written below the hooks (official publication is sealed outside the
 * storage tests), so every field a reader sees is chosen by the test. Nothing here touches
 * private storage or real content.
 */
export function createRecordSectionFixtures(payload: Payload) {
  const created: { collection: Slug; id: number }[] = []
  const tag = randomUUID().replaceAll('-', '').slice(0, 8)

  async function make(collection: Slug, data: Data): Promise<number> {
    const doc = await payload.db.create({ collection, data })
    const id = Number(doc.id)
    created.push({ collection, id })
    return id
  }
  const slug = (label: string) => `synthetic-${label}-${randomUUID().slice(0, 8)}`

  const org = (
    o: { name?: string; kind?: string; participating?: boolean; status?: Status } = {},
  ) => {
    const name = o.name ?? `Synthetic org ${randomUUID().slice(0, 6)}`
    return make('organizations', {
      name,
      slug: slug('org'),
      kind: o.kind ?? 'usg',
      participating: o.participating ?? false,
      _status: o.status ?? 'published',
    }).then(async (id) => ({ id, name, slug: await slugOf('organizations', id) }))
  }
  async function slugOf(collection: Slug, id: number): Promise<string> {
    const row = await payload.db.findOne({ collection, where: { id: { equals: id } } })
    return String((row as { slug?: string } | null)?.slug)
  }
  const office = async (o: {
    name?: string
    organization: number
    branch?: string
    parent?: number
    status?: Status
  }) => {
    const name = o.name ?? `Synthetic office ${randomUUID().slice(0, 6)}`
    const id = await make('offices', {
      name,
      slug: slug('office'),
      organization: o.organization,
      branch: o.branch,
      parent: o.parent,
      _status: o.status ?? 'published',
    })
    return { id, name, slug: await slugOf('offices', id) }
  }
  const year = async (
    o: { label?: string; startDate?: string; endDate?: string; status?: Status } = {},
  ) => {
    const label = o.label ?? `SY ${randomUUID().slice(0, 6)}`
    const id = await make('academic-years', {
      label,
      slug: slug('year'),
      startDate: o.startDate,
      endDate: o.endDate,
      _status: o.status ?? 'published',
    })
    return { id, label, slug: await slugOf('academic-years', id) }
  }
  const file = (
    organization: number,
    o: {
      state?: 'pending' | 'ready' | 'failed'
      previousVersion?: number
      size?: number
      filename?: string
      verifiedAt?: string
    } = {},
  ) =>
    make('documents', {
      organization,
      title: `Synthetic file ${randomUUID().slice(0, 6)}`,
      state: o.state ?? 'ready',
      storageKey: `ready/${randomUUID()}.pdf`,
      originalFilename: o.filename ?? 'synthetic-official.pdf',
      mimeType: 'application/pdf',
      size: o.size ?? 2048,
      sha256: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      previousVersion: o.previousVersion,
      verifiedAt: o.verifiedAt ?? new Date().toISOString(),
    })

  async function version(collection: 'issuances' | 'reports', parent: number, data: Data) {
    await payload.db.createVersion({
      collectionSlug: collection,
      parent,
      versionData: { _status: 'published', ...data },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      autosave: false,
    } as never)
  }

  async function record(
    collection: 'issuances' | 'reports',
    o: {
      title?: string
      organization: number
      mainDocument: number
      attachments?: number[]
      status?: Status
      publishedAt?: string
      issuingOffice?: number
      responsibleOffices?: number[]
      academicYear?: number
      type?: string
      identifier?: string
      summary?: string
      richState?: unknown
      related?: { relationTo: string; value: number }[]
      extra?: Data
    },
  ) {
    const common = {
      title: o.title ?? `Synthetic ${collection} ${randomUUID().slice(0, 6)}`,
      slug: slug(collection),
      organization: o.organization,
      mainDocument: o.mainDocument,
      academicYear: o.academicYear,
      _status: o.status ?? 'published',
      publishedAt: o.publishedAt ?? new Date().toISOString(),
      ...o.extra,
    }
    const id = await make(
      collection,
      collection === 'issuances'
        ? {
            ...common,
            type: o.type ?? 'resolution',
            seriesYear: 2026,
            documentNumber: o.identifier ?? `No. ${randomUUID().slice(0, 4)}`,
            normalizedNumber: randomUUID(),
            issuingOffice: o.issuingOffice,
            summary: o.richState ?? (o.summary ? richText(o.summary) : undefined),
          }
        : {
            ...common,
            type: o.type ?? 'financial',
            reportingPeriod: o.identifier ?? `Period ${randomUUID().slice(0, 4)}`,
            responsibleOffices: o.responsibleOffices,
            abstract: o.richState ?? (o.summary ? richText(o.summary) : undefined),
          },
    )
    // Relationship rows (attachments, related records) need the real join tables.
    if (o.attachments?.length || o.related?.length)
      await payload.db.updateOne({
        collection,
        where: { id: { equals: id } },
        data: { attachments: o.attachments, relatedRecords: o.related },
      })
    return { id, title: common.title, slug: common.slug }
  }

  const activity = async (o: {
    title?: string
    organization: number
    eventDate: string
    status?: Status
    academicYear?: number
    time?: string
    location?: string
    description?: string
    richState?: unknown
  }) => {
    const title = o.title ?? `Synthetic activity ${randomUUID().slice(0, 6)}`
    const id = await make('activities', {
      title,
      slug: slug('activity'),
      organization: o.organization,
      eventDate: o.eventDate,
      academicYear: o.academicYear,
      time: o.time,
      location: o.location,
      description: o.richState ?? (o.description ? richText(o.description) : undefined),
      _status: o.status ?? 'published',
      publishedAt: o.eventDate,
    })
    return { id, title, slug: await slugOf('activities', id) }
  }

  const post = async (
    o: { title?: string; status?: Status; publishedAt?: string | null; categories?: number[] } = {},
  ) => {
    const title = o.title ?? `Synthetic post ${randomUUID().slice(0, 6)}`
    const id = await make('posts', {
      title,
      slug: slug('post'),
      _status: o.status ?? 'published',
      publishedAt: o.publishedAt === undefined ? new Date().toISOString() : o.publishedAt,
    })
    // Relationship rows need the real join table.
    if (o.categories?.length)
      await payload.db.updateOne({
        collection: 'posts',
        where: { id: { equals: id } },
        data: { categories: o.categories },
      })
    return { id, title, slug: await slugOf('posts', id) }
  }

  /** The category with this slug, created only when absent; only a created one is removed. */
  const category = async (title: string, categorySlug: string) => {
    const existing = await payload.db.findOne({
      collection: 'categories',
      where: { slug: { equals: categorySlug } },
    })
    if (existing) return Number((existing as { id: number }).id)
    return make('categories', { title, slug: categorySlug })
  }
  const person = async (o: {
    name?: string
    status?: Status
    terms: { office: number; startDate?: string; endDate?: string; academicYear?: number }[]
  }) => {
    const name = o.name ?? `Synthetic person ${randomUUID().slice(0, 6)}`
    const id = await make('people', {
      name,
      slug: slug('person'),
      _status: o.status ?? 'published',
    })
    await payload.db.updateOne({
      collection: 'people',
      where: { id: { equals: id } },
      data: { terms: o.terms.map((term) => ({ id: randomUUID(), ...term })) },
    })
    return { id, name }
  }

  async function cleanup() {
    for (const { collection, id } of created.reverse()) {
      await payload.db
        .deleteVersions({ collection, where: { parent: { equals: id } } })
        .catch(() => undefined)
      await payload.db.deleteOne({ collection, where: { id: { equals: id } } })
    }
  }

  return {
    tag,
    post,
    category,
    org,
    office,
    year,
    file,
    issuance: (o: Parameters<typeof record>[1]) => record('issuances', o),
    report: (o: Parameters<typeof record>[1]) => record('reports', o),
    version,
    activity,
    person,
    cleanup,
  }
}
