import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)

describe('Payload domain migration adoption', () => {
  for (const predecessor of ['fresh', 'populated']) {
    it(`preserves ${predecessor} data, enforces constraints and denies direct API roles`, async () => {
      const { stdout } = await run(
        process.execPath,
        ['--import=tsx', 'tests/helpers/domainMigrations.mjs', predecessor],
        { timeout: 150000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      )
      expect(stdout).toContain('PASS complete migration history and repeat no-op')
      expect(stdout).toContain('PASS Data API lockdown, closed defaults and reviewed down()')
      expect(stdout).toContain('PASS last-saved-by additive upgrade and reviewed down()')
      expect(stdout).toContain('PASS canonical uniqueness, foreign keys and restricted roles')
      expect(stdout).toContain('PASS authored section links, enum constraint and cascade')
      expect(stdout).toContain('PASS rollback refuses authored section data')
      if (predecessor === 'populated') {
        expect(stdout).toContain('PASS search rows survive additive index fields')
        expect(stdout).toContain('PASS credentials, IDs, relationships, URLs and retained history')
        expect(stdout).toContain('PASS atomic additive migration rollback')
        expect(stdout).toContain(
          'PASS legacy Header rows keep IDs, order, stored strings and resolved URLs',
        )
      }
      console.info(stdout)
    }, 160000)
  }
})
