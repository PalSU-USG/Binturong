import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, handleEndpoints, type Payload } from 'payload'

import config from '@/payload.config'
import {
  clearPreservedLastEditedBy,
  preserveLastEditedBy,
  setLastEditedBy,
} from '@/fields/lastEditedBy'
import { syntheticContent as content } from '../helpers/contentFixtures'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const context = { disableRevalidate: true }

describe('lastEditedBy is server-owned', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const created: { collection: 'posts' | 'pages' | 'people' | 'organizations'; id: number }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    for (const record of created) {
      // Domain records are only deletable through the guarded draft path; remove below it.
      if (record.collection === 'people' || record.collection === 'organizations') {
        await payload.db.deleteVersions({
          collection: record.collection,
          where: { parent: { equals: record.id } },
        })
        await payload.db.deleteOne({
          collection: record.collection,
          where: { id: { equals: record.id } },
        })
      } else if (await payload.findByID({ ...record, disableErrors: true }))
        await payload.delete({ ...record, context })
    }
    await removeTestAccounts(
      payload,
      Object.values(fixtures?.users ?? {}).map(({ id }) => id),
    )
  })
  const actor = (role: 'editor' | 'publisher') => ({
    ...fixtures.users[role],
    collection: 'users' as const,
  })
  const stored = async (
    collection: 'posts' | 'pages' | 'people' | 'organizations',
    id: number,
  ) =>
    (
      (await payload.findByID({
        collection,
        id,
        draft: true,
        depth: 0,
        overrideAccess: true,
      })) as { lastEditedBy?: number | null }
    ).lastEditedBy

  it('overwrites a client-sent value with the authenticated saver, on create and update', async () => {
    const post = await payload.create({
      collection: 'posts',
      user: actor('editor'),
      overrideAccess: false,
      draft: true,
      context,
      data: {
        title: `Synthetic ${randomUUID()}`,
        slug: `synthetic-${randomUUID()}`,
        content,
        _status: 'draft',
        // Forged owner: must never be stored.
        lastEditedBy: fixtures.users.publisher.id,
      } as never,
    })
    created.push({ collection: 'posts', id: post.id })
    expect(await stored('posts', post.id)).toBe(fixtures.users.editor.id)

    await payload.update({
      collection: 'posts',
      id: post.id,
      user: actor('publisher'),
      overrideAccess: false,
      draft: true,
      context,
      data: {
        title: `Synthetic edit ${randomUUID()}`,
        lastEditedBy: fixtures.users.editor.id,
      } as never,
    })
    expect(await stored('posts', post.id)).toBe(fixtures.users.publisher.id)
  })

  it('records each saver when different accounts save at the same time', async () => {
    const make = () =>
      payload.create({
        collection: 'posts',
        draft: true,
        context,
        data: {
          title: `Synthetic ${randomUUID()}`,
          slug: `synthetic-${randomUUID()}`,
          content,
          _status: 'draft',
        } as never,
      })
    const [a, b] = await Promise.all([make(), make()])
    created.push({ collection: 'posts', id: a.id }, { collection: 'posts', id: b.id })
    const save = (id: number, role: 'editor' | 'publisher', forged: number) =>
      payload.update({
        collection: 'posts',
        id,
        user: actor(role),
        overrideAccess: false,
        draft: true,
        context,
        data: { title: `Synthetic edit ${randomUUID()}`, lastEditedBy: forged } as never,
      })
    await Promise.all([
      save(a.id, 'editor', fixtures.users.publisher.id),
      save(b.id, 'publisher', fixtures.users.editor.id),
    ])
    expect(await stored('posts', a.id)).toBe(fixtures.users.editor.id)
    expect(await stored('posts', b.id)).toBe(fixtures.users.publisher.id)
  })

  it('keeps a preserved saver in the request context, which nested saves copy', async () => {
    const hook = (req: { context: Record<string, unknown> }) =>
      setLastEditedBy({
        data: {},
        originalDoc: { lastEditedBy: 3 },
        req: req as never,
      } as never)
    const outer = { context: {} as Record<string, unknown> }
    preserveLastEditedBy(outer as never, { id: 7 })
    // Payload's nested Local API calls replace req.context with a spread copy.
    const nested = { context: { ...outer.context } }
    expect(await hook(nested)).toMatchObject({ lastEditedBy: 7 })
    clearPreservedLastEditedBy(nested as never)
    expect(await hook(nested)).toMatchObject({ lastEditedBy: 3 })
    preserveLastEditedBy(nested as never, null)
    expect(await hook(nested)).toMatchObject({ lastEditedBy: 3 })
  })

  it('ignores a forged value sent through the REST API', async () => {
    const response = await handleEndpoints({
      config,
      request: new Request('http://127.0.0.1:3003/api/posts?draft=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.editor}`,
        },
        body: JSON.stringify({
          title: `Synthetic rest ${randomUUID()}`,
          slug: `synthetic-${randomUUID()}`,
          content,
          _status: 'draft',
          lastEditedBy: fixtures.users.publisher.id,
        }),
      }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { doc: { id: number } }
    created.push({ collection: 'posts', id: body.doc.id })
    expect(await stored('posts', body.doc.id)).toBe(fixtures.users.editor.id)
  })

  it('records the saver on a domain collection draft', async () => {
    const person = await payload.create({
      collection: 'people',
      user: actor('editor'),
      overrideAccess: false,
      draft: true,
      data: {
        name: `Synthetic person ${randomUUID()}`,
        lastEditedBy: fixtures.users.publisher.id,
      } as never,
    })
    created.push({ collection: 'people', id: person.id })
    expect(await stored('people', person.id)).toBe(fixtures.users.editor.id)
  })

  it('never reaches anonymous readers or exposes user records', async () => {
    const post = await payload.create({
      collection: 'posts',
      user: actor('publisher'),
      overrideAccess: false,
      context,
      data: {
        title: `Synthetic public ${randomUUID()}`,
        slug: `synthetic-${randomUUID()}`,
        content,
        _status: 'published',
      },
    })
    created.push({ collection: 'posts', id: post.id })
    expect(await stored('posts', post.id)).toBe(fixtures.users.publisher.id)

    const anonymous = await handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api/posts/${post.id}?depth=2`),
    })
    expect(anonymous.status).toBe(200)
    const text = await anonymous.text()
    expect(text).not.toContain('lastEditedBy')
    expect(text).not.toContain(fixtures.users.publisher.email)

    const staff = await handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api/posts/${post.id}?depth=0`, {
        headers: { Authorization: `JWT ${fixtures.tokens.editor}` },
      }),
    })
    expect(((await staff.json()) as { lastEditedBy?: number }).lastEditedBy).toBe(
      fixtures.users.publisher.id,
    )
  })

  it('keeps the original saver when a publisher transitions a domain record to published and back to draft', async () => {
    const org = await payload.create({
      collection: 'organizations',
      user: actor('editor'),
      overrideAccess: false,
      draft: true,
      data: {
        name: `Synthetic transition ${randomUUID()}`,
        kind: 'usg',
      },
    })
    created.push({ collection: 'organizations', id: org.id })
    expect(await stored('organizations', org.id)).toBe(fixtures.users.editor.id)

    const review = async () => {
      const res = await handleEndpoints({
        config,
        request: new Request(`http://127.0.0.1:3003/api/organizations/${org.id}/review`, {
          headers: { Authorization: `JWT ${fixtures.tokens.publisher}` },
        }),
      })
      expect(res.status).toBe(200)
      return (await res.json()) as { expected: { versionID: number; versionHash: string } }
    }
    const pubExpected = (await review()).expected
    const pubRes = await handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api/organizations/${org.id}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.publisher}`,
        },
        body: JSON.stringify({ action: 'publish', expected: pubExpected }),
      }),
    })
    expect(pubRes.status).toBe(200)
    expect(await stored('organizations', org.id)).toBe(fixtures.users.editor.id)

    const witExpected = (await review()).expected
    const witRes = await handleEndpoints({
      config,
      request: new Request(`http://127.0.0.1:3003/api/organizations/${org.id}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${fixtures.tokens.publisher}`,
        },
        body: JSON.stringify({ action: 'withdraw', expected: witExpected }),
      }),
    })
    expect(witRes.status).toBe(200)
    expect(await stored('organizations', org.id)).toBe(fixtures.users.editor.id)
  })
})
