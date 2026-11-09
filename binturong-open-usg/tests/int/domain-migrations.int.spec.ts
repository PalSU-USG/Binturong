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
      expect(stdout).toContain('PASS twelve migrations and repeat no-op')
      expect(stdout).toContain('PASS canonical uniqueness, foreign keys and restricted roles')
      if (predecessor === 'populated') {
        expect(stdout).toContain('PASS search rows survive additive index fields')
        expect(stdout).toContain('PASS credentials, IDs, relationships, URLs and retained history')
        expect(stdout).toContain('PASS atomic additive migration rollback')
      }
      console.info(stdout)
    }, 160000)
  }
})
