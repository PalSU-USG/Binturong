import type { Payload, Where } from 'payload'

import { resolveHolders, type Holder } from './holders'
import type { Branch, OfficeInput } from './officeTree'

const base = { overrideAccess: false, draft: false, depth: 0 } as const
const published: Where = { _status: { equals: 'published' } }
const relId = (value: unknown): number | null => {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null
}
const branchOf = (v: unknown): Branch | null =>
  v === 'executive' || v === 'legislative' || v === 'judicial' ? v : null
const usable = (slug: unknown): slug is string =>
  typeof slug === 'string' && slug.length > 0 && slug.length <= 200 && !slug.includes('\0')

/** Published offices of published USG organizations. Anything unpublished is absent. */
export async function listOffices(payload: Payload): Promise<OfficeInput[]> {
  const orgs = await payload.find({
    collection: 'organizations',
    ...base,
    pagination: false,
    select: { kind: true },
    where: { and: [published, { kind: { equals: 'usg' } }] },
  })
  const ids = orgs.docs.map((o) => o.id)
  if (!ids.length) return []
  const { docs } = await payload.find({
    collection: 'offices',
    ...base,
    pagination: false,
    sort: 'name',
    select: { name: true, slug: true, branch: true, parent: true },
    where: { and: [published, { organization: { in: ids } }] },
  })
  return docs.flatMap((o) =>
    usable(o.slug)
      ? [
          {
            id: o.id,
            name: o.name,
            slug: o.slug,
            branch: branchOf(o.branch),
            parent: relId(o.parent),
          },
        ]
      : [],
  )
}

export type OfficePage = {
  name: string
  slug: string
  branch: Branch | null
  organization: string | null
  parent: { name: string; slug: string } | null
  children: { name: string; slug: string }[]
  holders: Holder[]
}

/** One published office with its published parent, children and holders. No person pages exist. */
export async function readOffice(
  payload: Payload,
  slug: string,
  now: Date = new Date(),
): Promise<OfficePage | null> {
  if (!usable(slug)) return null
  const found = await payload.find({
    collection: 'offices',
    ...base,
    limit: 1,
    where: { and: [{ slug: { equals: slug } }, published] },
  })
  const office = found.docs[0]
  if (!office || !usable(office.slug)) return null

  const parentID = relId(office.parent)
  const orgID = relId(office.organization)
  const [org, parent, children, people] = await Promise.all([
    orgID
      ? payload.find({
          collection: 'organizations',
          ...base,
          limit: 1,
          select: { name: true },
          where: { and: [{ id: { equals: orgID } }, published] },
        })
      : null,
    parentID
      ? payload.find({
          collection: 'offices',
          ...base,
          limit: 1,
          select: { name: true, slug: true },
          where: { and: [{ id: { equals: parentID } }, published] },
        })
      : null,
    payload.find({
      collection: 'offices',
      ...base,
      pagination: false,
      sort: 'name',
      select: { name: true, slug: true },
      where: { and: [{ parent: { equals: office.id } }, published] },
    }),
    payload.find({
      collection: 'people',
      ...base,
      pagination: false,
      select: { name: true, terms: true },
      where: { and: [{ 'terms.office': { equals: office.id } }, published] },
    }),
  ])
  const yearIDs = people.docs.flatMap((p) =>
    (p.terms ?? []).flatMap((t) =>
      relId(t.office) === office.id ? (relId(t.academicYear) ?? []) : [],
    ),
  )
  const years = yearIDs.length
    ? await payload.find({
        collection: 'academic-years',
        ...base,
        pagination: false,
        select: { label: true, startDate: true, endDate: true },
        where: { and: [{ id: { in: [...new Set(yearIDs)] } }, published] },
      })
    : null
  const yearById = new Map((years?.docs ?? []).map((y) => [y.id, y]))
  const terms = people.docs.flatMap((p) =>
    (p.terms ?? [])
      .filter((t) => relId(t.office) === office.id)
      .map((t) => ({
        name: p.name,
        startDate: t.startDate,
        endDate: t.endDate,
        academicYear: yearById.get(relId(t.academicYear) ?? 0) ?? null,
      })),
  )
  const pick = (d?: { name: string; slug?: string | null }) =>
    d && usable(d.slug) ? { name: d.name, slug: d.slug } : null
  return {
    name: office.name,
    slug: office.slug,
    branch: branchOf(office.branch),
    organization: org?.docs[0]?.name ?? null,
    parent: pick(parent?.docs[0]),
    children: children.docs.flatMap((c) => pick(c) ?? []),
    holders: resolveHolders(terms, now),
  }
}

export type ParticipatingCsg = { name: string; slug: string }

/** Published CSGs marked as participating. Zero is a valid, honest answer. */
export async function listParticipatingCsgs(payload: Payload): Promise<ParticipatingCsg[]> {
  const { docs } = await payload.find({
    collection: 'organizations',
    ...base,
    pagination: false,
    sort: 'name',
    select: { name: true, slug: true },
    where: { and: [published, { kind: { equals: 'csg' } }, { participating: { equals: true } }] },
  })
  return docs.flatMap((o) => (usable(o.slug) ? [{ name: o.name, slug: o.slug }] : []))
}
