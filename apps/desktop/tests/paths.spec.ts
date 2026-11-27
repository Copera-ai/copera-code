/** Copera Code Desktop data paths after the product environment mapping. */
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyDesktopProductEnvironment } from '../src/product-environment.ts'
import { resolveDesktopPaths } from '../src/paths.ts'

afterEach(() => { vi.unstubAllEnvs() })

describe('Desktop product environment', () => {
  it('ignores an inherited DSH_HOME and resolves the profile under ~/.copera-code', () => {
    vi.stubEnv('DSH_HOME', '/home/u/.dsh')
    vi.stubEnv('COPERA_CODE_HOME', undefined)
    applyDesktopProductEnvironment(process.env, '/home/u')
    expect(process.env.DSH_HOME).toBe(join('/home/u', '.copera-code'))
    expect(resolveDesktopPaths()).toEqual({
      profile: join('/home/u', '.copera-code', 'profiles', 'desktop'),
      lock: join('/home/u', '.copera-code', 'profiles', 'desktop', 'lock'),
    })
  })

  it('maps COPERA_CODE_* to the protected DSH_* names and deletes stale product values', () => {
    const env: NodeJS.ProcessEnv = {
      COPERA_CODE_HOME: '/data/copera', COPERA_CODE_TOKEN: 'token-value', COPERA_CODE_API_ORIGIN: 'https://api.example.test',
      DSH_HOME: '/home/u/.dsh', DSH_TELEMETRY_DISABLED: '0',
    }
    applyDesktopProductEnvironment(env, '/home/u')
    expect(env).toMatchObject({ DSH_HOME: '/data/copera', DSH_TELEMETRY_DISABLED: '1',
      DSH_COPERA_TOKEN: 'token-value', DSH_COPERA_API_ORIGIN: 'https://api.example.test' })
    const stale: NodeJS.ProcessEnv = { DSH_COPERA_TOKEN: 'inherited', DSH_COPERA_API_ORIGIN: 'https://inherited.example.test' }
    applyDesktopProductEnvironment(stale, '/home/u')
    expect(stale).not.toHaveProperty('DSH_COPERA_TOKEN')
    expect(stale).not.toHaveProperty('DSH_COPERA_API_ORIGIN')
  })

  it('isolates the data home before rejecting an invalid API origin', () => {
    const env: NodeJS.ProcessEnv = { DSH_HOME: '/home/u/.dsh', COPERA_CODE_API_ORIGIN: 'http://api.example.test', DSH_COPERA_API_ORIGIN: 'https://old.example.test' }
    expect(() => { applyDesktopProductEnvironment(env, '/home/u') }).toThrow('COPERA_CODE_API_ORIGIN must be an https:// URL')
    expect(env.DSH_HOME).toBe(join('/home/u', '.copera-code'))
    expect(env).not.toHaveProperty('DSH_COPERA_API_ORIGIN')
  })
})
