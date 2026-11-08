import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import {
  createAccessFixtures,
  fixturePassword,
  removeTestAccounts,
} from '../helpers/accessFixtures'
import { assertTestStorage } from '../helpers/assertTestStorage'
import { login } from '../helpers/login'
import {
  largeSyntheticPDF,
  removeObjects,
  sha256Hex,
  syntheticPDF,
} from '../helpers/officialFileFixtures'

const LARGE_BYTES = 13_000_000 // > 4.5 MB request limit and > two 6 MiB TUS chunks

test.describe('private official documents end to end', () => {
  test.setTimeout(300000)
  // Publication verifies each referenced PDF on a dev server that compiles routes on demand.
  const slow = expect.configure({ timeout: 30000 })
  let payload: Payload
  let fixtures: Awaited<ReturnType<typeof createAccessFixtures>>
  let orgID: number
  let orgName: string
  let issuanceID = 0

  test.beforeAll(async () => {
    assertTestStorage(process.env.OFFICIAL_STORAGE_URL, process.env.OFFICIAL_STORAGE_BUCKET)
    payload = await getPayload({ config })
    fixtures = await createAccessFixtures(payload)
    orgName = `Synthetic documents org ${randomUUID()}`
    const org = await payload.create({
      collection: 'organizations',
      draft: true,
      overrideAccess: false,
      user: { ...fixtures.users.editor, collection: 'users' },
      data: { name: orgName, kind: 'usg' },
    })
    orgID = org.id
    const headers = { Authorization: `JWT ${fixtures.tokens.publisher}` }
    const base = 'http://127.0.0.1:3003'
    const review = await (
      await fetch(`${base}/api/organizations/${orgID}/review`, { headers })
    ).json()
    const published = await fetch(`${base}/api/organizations/${orgID}/transition`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish', expected: review.expected }),
    })
    expect(published.ok, await published.clone().text()).toBe(true)
  })

  test.afterAll(async () => {
    if (!payload) return
    const keys: string[] = []
    // Everything under the synthetic organization is test-owned, including aborted sessions.
    const owned = (
      await payload.db.find({
        collection: 'documents',
        where: { organization: { equals: orgID } },
        pagination: false,
      })
    ).docs as { id: number; storageKey?: string; stagingKey?: string }[]
    for (const row of owned)
      for (const key of [row.storageKey, row.stagingKey]) if (key) keys.push(key)
    if (issuanceID) {
      await payload.db.deleteVersions({
        collection: 'issuances',
        where: { parent: { equals: issuanceID } },
      })
      await payload.db.deleteOne({ collection: 'issuances', where: { id: { equals: issuanceID } } })
    }
    // Newest first: a replacement references its predecessor.
    for (const { id } of owned.sort((a, b) => b.id - a.id))
      await payload.db.deleteOne({ collection: 'documents', where: { id: { equals: id } } })
    await removeObjects(keys)
    if (orgID) {
      await payload.db.deleteVersions({
        collection: 'organizations',
        where: { parent: { equals: orgID } },
      })
      await payload.db.deleteOne({ collection: 'organizations', where: { id: { equals: orgID } } })
    }
    if (fixtures)
      await removeTestAccounts(
        payload,
        Object.values(fixtures.users).map(({ id }) => id),
      )
  })

  async function signIn(page: Page, role: 'editor' | 'publisher') {
    await page.context().clearCookies()
    await login({ page, user: { email: fixtures.users[role].email, password: fixturePassword } })
  }

  async function uploadThroughAdmin(
    page: Page,
    title: string,
    filename: string,
    bytes: Uint8Array,
    replaces?: number,
  ) {
    await page.goto('/admin/collections/documents')
    const drawer = page.getByTestId('document-upload-drawer')
    // The first click can land before hydration on a cold dev server; retry until the drawer opens.
    await expect(async () => {
      await page.getByRole('button', { name: 'Upload official PDF', exact: true }).click()
      await expect(drawer).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 60000 })
    await drawer.locator('#official-doc-title').fill(title)
    await drawer.locator('#official-doc-organization').click()
    await page.getByRole('option', { name: new RegExp(`${orgName}`) }).click()
    if (replaces) {
      await drawer.locator('#official-doc-previous-version').click()
      await page.getByRole('option', { name: new RegExp(`\\(#${replaces}\\)`) }).click()
    }
    await drawer.locator('#official-doc-file').setInputFiles({
      name: filename,
      mimeType: 'application/pdf',
      buffer: Buffer.from(bytes),
    })
    return drawer
  }

  test('uploads, resumes, verifies, publishes, delivers, withdraws and restores a >4.5 MB PDF', async ({
    page,
    request,
  }) => {
    const large = await largeSyntheticPDF(LARGE_BYTES, 'Synthetic browser large')
    const largeHash = sha256Hex(large)
    expect(large.byteLength).toBeGreaterThan(4_500_000)
    const creations: string[] = []
    const transfers: string[] = []
    page.on('request', (r) => {
      if (!r.url().includes('/upload/resumable')) return
      if (r.method() === 'POST') creations.push(r.url())
      else transfers.push(r.method())
    })
    // ---- editor: interrupted then resumed TUS upload ----
    await signIn(page, 'editor')
    const drawer = await uploadThroughAdmin(page, 'Synthetic large resolution', 'large.pdf', large)
    let blocking = true
    let admitted = 0
    await page.route(/\/upload\/resumable/, async (route) => {
      if (blocking && admitted++ >= 1) await route.abort('connectionfailed')
      else await route.continue()
    })
    await drawer.getByRole('button', { name: 'Upload and verify PDF', exact: true }).click()
    const status = drawer.getByTestId('document-upload-status')
    await expect(status).toContainText(/Upload paused at/, { timeout: 60000 })
    await expect(drawer.getByRole('alert')).toBeVisible()
    expect(creations).toHaveLength(1)
    blocking = false
    await drawer.getByRole('button', { name: 'Resume upload', exact: true }).click()
    await expect(status).toContainText(/Verified ready document #\d+/, { timeout: 120000 })
    await page.unroute(/\/upload\/resumable/)
    expect(creations, 'resume must continue the same TUS upload, not create another').toHaveLength(
      1,
    )
    expect(transfers.length).toBeGreaterThan(0)
    const shown = (await status.textContent())!
    const firstID = Number(/#(\d+)/.exec(shown)![1])
    expect(shown).toContain(largeHash)

    const row = await payload.findByID({ collection: 'documents', id: firstID, depth: 0 })
    expect(row).toMatchObject({ state: 'ready', size: large.byteLength, sha256: largeHash })
    expect(row.verifiedAt).toBeTruthy()
    const asEditor = await page.request.get(`/api/documents/${firstID}`)
    expect(asEditor.status()).toBe(200)
    expect(JSON.stringify(await asEditor.json())).not.toContain('ready/')

    // ---- forged metadata is denied at the server ----
    const forged = await page.request.post('/api/documents/begin-upload', {
      data: {
        title: 'Forged',
        organization: orgID,
        originalFilename: 'x.pdf',
        requestId: randomUUID(),
        state: 'ready',
        sha256: 'a'.repeat(64),
        storageKey: `ready/${randomUUID()}.pdf`,
      },
    })
    expect(forged.status()).toBe(400)
    for (const attempt of [
      page.request.post('/api/documents', {
        data: { title: 'Forged', organization: orgID, state: 'ready' },
      }),
      page.request.patch(`/api/documents/${firstID}`, { data: { sha256: 'b'.repeat(64) } }),
      page.request.delete(`/api/documents/${firstID}`),
    ])
      expect([403, 404, 405]).toContain((await attempt).status())
    const untouched = await payload.findByID({ collection: 'documents', id: firstID, depth: 0 })
    expect(untouched.sha256).toBe(largeHash)
    const stolen = await request.post(`/api/documents/${firstID}/finalize`, {
      headers: { Authorization: `JWT ${fixtures.tokens.publisher}` },
    })
    expect(stolen.status()).toBe(403)

    // ---- editor: immutable replacement is a new version ----
    const small = await syntheticPDF(`Synthetic replacement ${randomUUID()}`)
    const smallHash = sha256Hex(small)
    const drawer2 = await uploadThroughAdmin(
      page,
      'Synthetic large resolution v2',
      'replacement.pdf',
      small,
      firstID,
    )
    await drawer2.getByRole('button', { name: 'Upload and verify PDF', exact: true }).click()
    const status2 = drawer2.getByTestId('document-upload-status')
    await expect(status2).toContainText(/Verified ready document #\d+/, { timeout: 120000 })
    const secondID = Number(/#(\d+)/.exec((await status2.textContent())!)![1])
    expect(secondID).not.toBe(firstID)
    const second = await payload.findByID({ collection: 'documents', id: secondID, depth: 0 })
    const prev = second.previousVersion
    expect(typeof prev === 'object' ? prev?.id : prev).toBe(firstID)
    const oldBytes = await page.request.get(`/api/documents/${firstID}/file`)
    expect(oldBytes.status()).toBe(200)
    expect(sha256Hex(new Uint8Array(await oldBytes.body()))).toBe(largeHash)

    // ---- staff draft delivery, anonymous denial ----
    const staff = await page.request.get(`/api/documents/${secondID}/file`)
    expect(staff.status()).toBe(200)
    expect(sha256Hex(new Uint8Array(await staff.body()))).toBe(smallHash)
    expect((await request.get(`/api/documents/${secondID}/file`)).status()).toBe(404)
    expect((await request.get(`/api/documents/${firstID}/file`)).status()).toBe(404)

    // ---- editor drafts the record; publisher publishes ----
    const issuance = await payload.create({
      collection: 'issuances',
      draft: true,
      overrideAccess: false,
      user: { ...fixtures.users.editor, collection: 'users' },
      data: {
        title: 'Synthetic official with private PDF',
        type: 'advisory',
        organization: orgID,
        mainDocument: secondID,
        attachments: [firstID],
      },
    })
    issuanceID = issuance.id
    await signIn(page, 'publisher')
    await page.goto(`/admin/collections/issuances/${issuanceID}`)
    await page.getByRole('button', { name: 'Review saved revision', exact: true }).click()
    const publish = page.getByRole('button', { name: 'Publish reviewed revision', exact: true })
    await expect(publish).toBeEnabled({ timeout: 15000 })
    await publish.click()
    await slow
      .poll(async () => (await request.get(`/api/issuances/${issuanceID}`)).status())
      .toBe(200)
    const downloaded = await request.get(`/api/documents/${firstID}/file`)
    expect(downloaded.status()).toBe(200)
    expect(sha256Hex(new Uint8Array(await downloaded.body()))).toBe(largeHash)
    expect(downloaded.headers()['content-length']).toBe(String(large.byteLength))
    const downloadedMain = await request.get(`/api/documents/${secondID}/file`)
    expect(sha256Hex(new Uint8Array(await downloadedMain.body()))).toBe(smallHash)
    const publicIssuance = JSON.stringify(
      await (await request.get(`/api/issuances/${issuanceID}`)).json(),
    )
    expect(publicIssuance).not.toContain('ready/')
    expect(publicIssuance).not.toContain('storageKey')

    // ---- withdrawal removes anonymous access ----
    await page.goto(`/admin/collections/issuances/${issuanceID}`)
    await page.getByRole('button', { name: 'Review saved revision', exact: true }).click()
    await page.getByRole('button', { name: 'Review withdrawal', exact: true }).click()
    await page.getByRole('button', { name: 'Withdraw published revision', exact: true }).click()
    await slow
      .poll(async () => (await request.get(`/api/documents/${secondID}/file`)).status())
      .toBe(404)
    expect((await request.get(`/api/documents/${firstID}/file`)).status()).toBe(404)
    expect((await request.get(`/api/issuances/${issuanceID}`)).status()).toBe(404)

    // ---- history restoration publishes the saved version again ----
    await page.goto(`/admin/collections/issuances/${issuanceID}`)
    await page.getByRole('button', { name: 'Review saved revision', exact: true }).click()
    const review = await (await page.request.get(`/api/issuances/${issuanceID}/review`)).json()
    const oldest = review.versions[review.versions.length - 1].id
    await page.getByLabel('Historical version', { exact: true }).click()
    await page
      .getByRole('option')
      .filter({ hasText: `(version ${oldest})` })
      .click()
    await page.getByRole('button', { name: 'Review selected version', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Historical content to restore' })).toBeVisible()
    await page.getByRole('button', { name: 'Restore reviewed revision', exact: true }).click()
    await slow
      .poll(async () => (await request.get(`/api/documents/${firstID}/file`)).status())
      .toBe(200)
    const restored = await request.get(`/api/documents/${firstID}/file`)
    expect(sha256Hex(new Uint8Array(await restored.body()))).toBe(largeHash)
  })
})
