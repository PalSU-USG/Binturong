import type { Payload } from 'payload'

/**
 * The only privileged (`overrideAccess: true`) reads in the public record pages. Documents are
 * not publicly readable, so a visitor-facing page cannot ask for file name, size or checksum
 * under their own access. These helpers never take a document id from the caller: they read the
 * published record themselves (as an anonymous visitor would) and follow only that record's own
 * references. Storage keys and every other internal field are never selected or returned.
 */

export type FileOwner = 'issuances' | 'reports'

export type PublicFile = {
  id: number
  filename: string
  size: number | null
  sha256: string | null
}
export type PublicFileVersion = {
  /** 1-based position among published versions only, oldest first. */
  number: number
  size: number | null
  date: string | null
  current: boolean
}
export type PublicFileFacts = {
  main: PublicFile | null
  attachments: PublicFile[]
  versions: PublicFileVersion[]
}

const EMPTY = (): PublicFileFacts => ({ main: null, attachments: [], versions: [] })
const MAX_CHAIN = 50

const relationID = (value: unknown): number | null => {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null
}

type DocFacts = {
  id: number
  originalFilename?: string | null
  size?: number | null
  sha256?: string | null
  previousVersion?: unknown
  verifiedAt?: string | null
}

/** Published records only: the record is read as an anonymous visitor, never with `overrideAccess`. */
async function readPublishedReferences(payload: Payload, collection: FileOwner, ids: number[]) {
  if (!ids.length) return []
  const { docs } = await payload.find({
    collection,
    overrideAccess: false,
    draft: false,
    depth: 0,
    pagination: false,
    select: { mainDocument: true, attachments: true },
    where: { and: [{ id: { in: ids } }, { _status: { equals: 'published' } }] },
  })
  return docs.map((doc) => ({
    id: doc.id,
    main: relationID(doc.mainDocument),
    attachments: (doc.attachments ?? []).flatMap((a) => relationID(a) ?? []),
  }))
}

async function readReadyDocuments(payload: Payload, ids: number[]): Promise<Map<number, DocFacts>> {
  if (!ids.length) return new Map()
  const { docs } = await payload.find({
    collection: 'documents',
    overrideAccess: true, // reviewed exception: allow-listed fields, ids from a published record
    depth: 0,
    pagination: false,
    select: {
      originalFilename: true,
      size: true,
      sha256: true,
      previousVersion: true,
      verifiedAt: true,
    },
    where: { and: [{ id: { in: ids } }, { state: { equals: 'ready' } }] },
  })
  return new Map(docs.map((doc) => [doc.id, doc]))
}

const toFile = (doc: DocFacts): PublicFile => ({
  id: doc.id,
  filename: doc.originalFilename?.trim() || 'Official document',
  size: typeof doc.size === 'number' ? doc.size : null,
  sha256: doc.sha256 || null,
})

/** Facts for a currently published record's main file, attachments and published version history. */
export async function readPublicFileFacts(
  payload: Payload,
  record: { collection: FileOwner; id: number },
): Promise<PublicFileFacts> {
  const [published] = await readPublishedReferences(payload, record.collection, [record.id])
  if (!published) return EMPTY()
  const ids = [published.main, ...published.attachments].flatMap((id) => id ?? [])
  const ready = await readReadyDocuments(payload, ids)
  const mainDoc = published.main ? ready.get(published.main) : undefined
  const facts: PublicFileFacts = {
    main: mainDoc ? toFile(mainDoc) : null,
    attachments: published.attachments.flatMap((id) => {
      const doc = ready.get(id)
      return doc ? [toFile(doc)] : []
    }),
    versions: [],
  }
  if (mainDoc) facts.versions = await readPublishedVersions(payload, record, mainDoc)
  return facts
}

/** Walks `previousVersion`; an older file counts only if a published revision of this record used it. */
async function readPublishedVersions(
  payload: Payload,
  record: { collection: FileOwner; id: number },
  current: DocFacts,
): Promise<PublicFileVersion[]> {
  const { docs: revisions } = await payload.findVersions({
    collection: record.collection,
    overrideAccess: true, // reviewed exception: only the ids of files used by published revisions
    depth: 0,
    pagination: false,
    select: { version: { mainDocument: true } },
    where: {
      and: [{ parent: { equals: record.id } }, { 'version._status': { equals: 'published' } }],
    },
  })
  const publishedFiles = new Set(
    revisions.flatMap((revision) => relationID(revision.version?.mainDocument) ?? []),
  )
  const chain: DocFacts[] = [current]
  for (let doc = current; chain.length < MAX_CHAIN;) {
    const previous = relationID(doc.previousVersion)
    if (!previous || chain.some((c) => c.id === previous)) break
    const found = (await readReadyDocuments(payload, [previous])).get(previous)
    if (!found) break
    chain.push(found)
    doc = found
  }
  return chain
    .reverse()
    .filter((doc) => doc.id === current.id || publishedFiles.has(doc.id))
    .map((doc, index) => ({
      number: index + 1,
      size: typeof doc.size === 'number' ? doc.size : null,
      date: doc.verifiedAt ?? null,
      current: doc.id === current.id,
    }))
}

/** Record id -> main document id, only for published records whose main file is ready. */
export async function readReadyMainDocuments(
  payload: Payload,
  collection: FileOwner,
  recordIDs: number[],
): Promise<Map<number, number>> {
  const ids = [...new Set(recordIDs.flatMap((id) => relationID(id) ?? []))]
  const published = await readPublishedReferences(payload, collection, ids)
  const ready = await readReadyDocuments(
    payload,
    published.flatMap((p) => p.main ?? []),
  )
  return new Map(published.flatMap((p) => (p.main && ready.has(p.main) ? [[p.id, p.main]] : [])))
}
