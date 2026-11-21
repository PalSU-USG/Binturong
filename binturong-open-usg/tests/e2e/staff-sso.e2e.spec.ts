import { createHash, createHmac, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'
import { createLocalReq, getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { withAccountProvisioning } from '../../src/collections/Users/accountProvisioning'
import {
  createAccessFixtures,
  fixturePassword,
  removeTestAccounts,
} from '../helpers/accessFixtures'

const domain = 'psu.palawan.edu.ph'
const mockURL = process.env.BINTURONG_SSO_TEST_URL
const signingKey = 'synthetic-binturong-sso-tests'
const toBase64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

test.describe('staff Google sign-in', () => {
  test.describe.configure({ timeout: 120_000 })
  test.skip(!mockURL, 'Run with the loopback Supabase test URL')
  let upstream: Server
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  let activeEmail: string
  let selectedEmail: string
  const requestedEmail = `request-${randomUUID()}@${domain}`
  const accessRequests = '/api/access-requests'
  const created: number[] = []

  test.beforeAll(async () => {
    const mock = new URL(mockURL!)
    if (mock.protocol !== 'http:' || mock.hostname !== '127.0.0.1' || !mock.port)
      throw new Error('SSO tests require a private loopback mock server')
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
    activeEmail = `editor-${randomUUID()}@${domain}`
    const local = await createLocalReq({}, payload)
    await withAccountProvisioning(local, () =>
      payload.update({
        collection: 'users',
        id: fixtures.users.editor.id,
        data: { email: activeEmail },
        req: local,
      }),
    )
    selectedEmail = activeEmail
    const codes = new Map<string, { email: string; challenge: string }>()
    const sessions = new Map<string, { user: object; refresh: string }>()
    upstream = createServer((req, res) => {
      const url = new URL(req.url ?? '/', mock)
      const send = (status: number, data: object) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(data))
      }
      if (url.pathname === '/auth/v1/authorize') {
        const callback = new URL(url.searchParams.get('redirect_to')!)
        const code = randomUUID()
        const challenge = url.searchParams.get('code_challenge')
        if (
          url.searchParams.get('provider') !== 'google' ||
          url.searchParams.get('code_challenge_method')?.toLowerCase() !== 's256' ||
          !challenge
        )
          return send(400, { message: 'Expected a Google PKCE request' })
        codes.set(code, { email: selectedEmail, challenge })
        callback.searchParams.set('code', code)
        callback.searchParams.set('next', 'https://outside.invalid/')
        res.writeHead(302, { Location: callback.href })
        res.end()
      } else if (
        url.pathname === '/auth/v1/token' &&
        url.searchParams.get('grant_type') === 'pkce'
      ) {
        let body = ''
        req.on('data', (chunk) => {
          body += chunk.toString()
        })
        req.on('end', () => {
          const { auth_code: code, code_verifier: verifier } = JSON.parse(body)
          const issued = codes.get(code)
          if (
            !issued ||
            typeof verifier !== 'string' ||
            createHash('sha256').update(verifier).digest('base64url') !== issued.challenge
          )
            return send(400, { message: 'Invalid PKCE exchange' })
          codes.delete(code)
          const { email } = issued
          const now = Math.floor(Date.now() / 1000)
          const id = randomUUID()
          const user = {
            id,
            email,
            email_confirmed_at: new Date().toISOString(),
            aud: 'authenticated',
            identities: [{ provider: 'google', identity_data: { email, email_verified: true } }],
          }
          const header = toBase64({ alg: 'HS256', typ: 'JWT' })
          const claims = toBase64({
            sub: id,
            email,
            amr: [{ method: 'oauth', timestamp: now }],
            exp: now + 3600,
            aud: 'authenticated',
            iss: `${mock.origin}/auth/v1`,
            iat: now,
          })
          const signature = createHmac('sha256', signingKey)
            .update(`${header}.${claims}`)
            .digest('base64url')
          const token = `${header}.${claims}.${signature}`
          const refresh = randomUUID()
          sessions.set(token, { user, refresh })
          send(200, {
            access_token: token,
            refresh_token: refresh,
            expires_in: 3600,
            token_type: 'bearer',
            user,
          })
        })
      } else {
        const token = req.headers.authorization?.replace(/^Bearer /i, '') ?? ''
        const session = sessions.get(token)
        if (!session)
          return send(401, { code: 'session_not_found', message: 'Invalid test session' })
        if (url.pathname === '/auth/v1/user') return send(200, session.user)
        if (url.pathname === '/auth/v1/logout') {
          sessions.delete(token)
          res.writeHead(204)
          res.end()
        } else send(404, { message: 'Unknown mock route' })
      }
    })
    await new Promise<void>((resolve, reject) => {
      upstream.once('error', reject)
      upstream.listen(Number(mock.port), mock.hostname, resolve)
    })
  })

  test.afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!upstream?.listening) return resolve()
      upstream.close((error) => (error ? reject(error) : resolve()))
    })
    if (!payload || !fixtures) return
    await payload.delete({
      collection: 'access-requests',
      where: { email: { equals: requestedEmail } },
      overrideAccess: true,
    })
    await removeTestAccounts(payload, [
      ...Object.values(fixtures.users).map(({ id }) => id),
      ...created,
    ])
  })

  test('signs in an existing editor, keeps password login and signs out both sessions', async ({
    page,
    request,
  }) => {
    selectedEmail = activeEmail
    await page.goto('/admin/login')
    await page.getByRole('button', { name: 'Sign in with Google' }).click()
    await expect(page).toHaveURL(/\/admin\/?$/)
    const staff = await page.request.get('/api/users/me')
    const signedIn = await staff.json()
    expect(signedIn.user.email).toBe(activeEmail)
    expect(signedIn.exp).toBeGreaterThan(Date.now() / 1000)
    const refresh = await page.request.post('/api/users/refresh-token')
    expect(refresh.status()).toBe(200)
    const refreshed = await refresh.json()
    expect(refreshed.user.email).toBe(activeEmail)
    expect(refreshed.exp).toBeGreaterThan(Date.now() / 1000)
    expect(refreshed).not.toHaveProperty('refreshedToken')
    expect((await page.request.get(accessRequests)).status()).toBe(403)
    expect(
      (await page.request.post(accessRequests, { data: { email: activeEmail } })).status(),
    ).toBe(403)
    const password = await request.post('/api/users/login', {
      data: { email: fixtures.users.super_admin.email, password: fixturePassword },
    })
    expect(password.ok()).toBe(true)
    expect((await request.post('/api/users/refresh-token')).ok()).toBe(true)
    await page.goto('/admin/logout')
    await expect(page).toHaveURL(/\/admin\/login$/)
    expect((await (await page.request.get('/api/users/me')).json()).user).toBeNull()
    expect(
      (await page.context().cookies()).filter(({ name }) => name.startsWith('binturong-sso')),
    ).toHaveLength(0)
    await page
      .context()
      .addCookies([
        { name: 'binturong-sso', value: 'invalid-test-cookie', url: new URL('/', page.url()).href },
      ])
    expect((await (await page.request.get('/api/users/me')).json()).user).toBeNull()
  })

  test('records one campus request and lets an admin approve a permitted role', async ({
    page,
    request,
  }) => {
    selectedEmail = requestedEmail
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.goto('/admin/login')
      await page.getByRole('button', { name: 'Sign in with Google' }).click()
      await expect(
        page.getByRole('status').filter({ hasText: 'Your request was sent' }),
      ).toBeVisible()
    }
    expect((await request.get(accessRequests)).status()).toBe(403)
    expect((await request.post(accessRequests, { data: { email: requestedEmail } })).status()).toBe(
      403,
    )
    const admin = { Authorization: `JWT ${fixtures.tokens.admin}` }
    const found = await (
      await request.get(accessRequests, {
        headers: admin,
        params: { 'where[email][equals]': requestedEmail },
      })
    ).json()
    expect(found.totalDocs).toBe(1)
    const endpoint = `${accessRequests}/${found.docs[0].id}`
    const editor = { Authorization: `JWT ${fixtures.tokens.editor}` }
    expect(
      (await request.patch(endpoint, { headers: editor, data: { name: 'Changed' } })).status(),
    ).toBe(403)
    expect(
      (
        await request.post(`${endpoint}/approve`, { headers: editor, data: { role: 'editor' } })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.post(`${endpoint}/approve`, { headers: admin, data: { role: 'super_admin' } })
      ).status(),
    ).toBe(400)
    const approvals = await Promise.all(
      Array.from({ length: 2 }, () =>
        request.post(`${endpoint}/approve`, { headers: admin, data: { role: 'publisher' } }),
      ),
    )
    expect(approvals.map((response) => response.status()).sort()).toEqual([201, 404])
    const approval = approvals.find((response) => response.status() === 201)!
    const { id } = await approval.json()
    created.push(id)
    expect((await payload.findByID({ collection: 'users', id })).role).toBe('publisher')
    expect((await request.get(endpoint, { headers: admin })).status()).toBe(404)

    const invite = '/api/users/invite-google'
    const invitedEmail = `invited-${randomUUID()}@${domain}`
    expect(
      (
        await request.post(invite, {
          headers: editor,
          data: { email: invitedEmail, role: 'editor' },
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.post(invite, {
          headers: admin,
          data: { email: 'invite@example.invalid', role: 'editor' },
        })
      ).status(),
    ).toBe(400)
    const invited = await request.post(invite, {
      headers: admin,
      data: { email: invitedEmail, role: 'editor' },
    })
    expect(invited.status()).toBe(201)
    const body = await invited.json()
    created.push(body.id)
    expect(Object.keys(body)).toEqual(['id'])
    expect((await payload.findByID({ collection: 'users', id: body.id })).email).toBe(invitedEmail)
  })

  test('rejects an out-of-domain identity and blocks a disabled editor on the next request', async ({
    page,
  }) => {
    await page.goto('/auth/callback?error_code=provider_email_needs_verification')
    await expect(
      page.getByRole('status').filter({ hasText: 'Use your verified campus Google account' }),
    ).toBeVisible()
    selectedEmail = `synthetic@${domain}.example.invalid`
    await page.goto('/admin/login')
    await page.getByRole('button', { name: 'Sign in with Google' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Use your verified campus Google account' }),
    ).toBeVisible()
    expect(
      (
        await payload.count({
          collection: 'access-requests',
          where: { email: { equals: selectedEmail } },
        })
      ).totalDocs,
    ).toBe(0)
    selectedEmail = activeEmail
    await page.getByRole('button', { name: 'Sign in with Google' }).click()
    await expect(page).toHaveURL(/\/admin\/?$/)
    const actor = await createLocalReq(
      { user: { ...fixtures.users.admin, collection: 'users' } },
      payload,
    )
    await payload.update({
      collection: 'users',
      id: fixtures.users.editor.id,
      data: { disabled: true },
      req: actor,
      overrideAccess: false,
    })
    expect((await (await page.request.get('/api/users/me')).json()).user).toBeNull()
    const signedOut = await page.request.post('/api/users/logout')
    expect(signedOut.status()).toBe(200)
    expect(
      (await page.context().cookies()).some(({ name }) => name.startsWith('binturong-sso')),
    ).toBe(false)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login/)
  })
})
