import { vi } from 'vitest'

/**
 * Builds the real Payload config afresh after stubbing env, because the config reads env at
 * import time. Call `vi.unstubAllEnvs()` and `vi.resetModules()` in `afterEach`.
 */
export const buildConfigWith = async (env: Record<string, string>) => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  vi.resetModules()
  const { default: config } = await import('@/payload.config')
  return config
}
