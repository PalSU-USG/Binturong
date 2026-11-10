import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, handleEndpoints, type Payload } from 'payload'

import config from '@/payload.config'
import { syntheticContent as content } from '../helpers/contentFixtures'
import { createAccessFixtures, removeTestAccounts } from '../helpers/accessFixtures'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const context = { disableRevalidate: true }

describe('lastEditedBy is server-owned', () => {
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  const created: { collection: 'posts' | 'pages' | 'people'; id: number }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
  })
  afterAll(async () => {
    for (const record of created) {
      // Domain records are only deletable through the guarded draft path; remove below it.
      if (record.collection === 'people') {
        await payload.db.deleteVersions({
          collection: 'people',
          where: { parent: { equals: record.id } },
        })
        await payload.db.deleteOne({ collection: 'people', where: { id: { equals: record.id } } })
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
  const stored = async (collection: 'posts' | 'pages' | 'people', id: number) =>
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
})
