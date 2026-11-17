import { describe, expect, it, vi } from 'vitest'

class Redirected extends Error {
  constructor(public to: string) {
    super(`redirect:${to}`)
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to)
  },
}))
vi.mock('@payloadcms/next/templates', () => ({
  DefaultTemplate: ({ children }: { children: unknown }) => children,
}))
vi.mock('@/access/activeAccount', () => ({ getActiveAccount: async () => null }))

import HowTo from '@/admin/howTo'

const open = (user: unknown) =>
  HowTo({
    initPageResult: { permissions: { canAccessAdmin: false }, req: { user } },
    params: {},
    searchParams: {},
  } as never)

describe('how-to guard', () => {
  it('sends a signed-in account without admin access to the page that explains why', async () => {
    await expect(open({ id: 1, collection: 'users' })).rejects.toMatchObject({
      to: '/admin/unauthorized',
    })
  })

  it('sends a visitor who is not signed in to the login page', async () => {
    await expect(open(null)).rejects.toMatchObject({ to: '/admin/login' })
  })
})
