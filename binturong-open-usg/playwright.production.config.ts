import { defineConfig } from '@playwright/test'
import base from './playwright.config'

const baseURL = 'http://127.0.0.1:3004'

export default defineConfig({
  ...base,
  testDir: './tests/production',
  workers: 1,
  timeout: 90000,
  use: { ...base.use, baseURL },
  webServer: {
    command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3004',
    env: { NEXT_PUBLIC_SERVER_URL: baseURL, NEXT_TELEMETRY_DISABLED: '1' },
    url: baseURL,
    timeout: 240000,
    reuseExistingServer: false,
  },
})
