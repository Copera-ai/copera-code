import { describe, expect, it } from 'vitest'
import { resolveLaunch, resolveProductEnv } from '../src/resolve-launch.ts'

const HOME = '/home/someone'

/** Resolve a launch that must succeed, failing the test with its error otherwise. */
function launch(argv: string[], env: NodeJS.ProcessEnv = {}): { argv: string[]; env: Record<string, string | undefined> } {
  const result = resolveLaunch(argv, env, HOME)
  if ('error' in result) throw new Error(`unexpected error: ${result.error}`)
  return result
}

/** Resolve a launch that must be rejected, returning its message. */
function rejection(argv: string[], env: NodeJS.ProcessEnv = {}): string {
  const result = resolveLaunch(argv, env, HOME)
  if (!('error' in result)) throw new Error(`expected an error, got argv ${JSON.stringify(result.argv)}`)
  return result.error
}

describe('resolveLaunch argv', () => {
  it('always boots the copera profile', () => {
    expect(launch([]).argv).toEqual(['--profile', 'copera'])
  })

  it('treats a leading web as an alias for no mode', () => {
    expect(launch(['web'])).toEqual(launch([]))
  })

  it('keeps the flags after the web alias', () => {
    expect(launch(['web', '--port', '4000']).argv).toEqual(['--profile', 'copera', '--port', '4000'])
  })

  it('passes the supported flags through in order', () => {
    expect(launch(['--help']).argv).toEqual(['--profile', 'copera', '--help'])
    expect(launch(['-h']).argv).toEqual(['--profile', 'copera', '-h'])
    expect(launch(['--version']).argv).toEqual(['--profile', 'copera', '--version'])
    expect(launch(['--host', '127.0.0.1', '--port=0', '--no-open']).argv)
      .toEqual(['--profile', 'copera', '--host', '127.0.0.1', '--port=0', '--no-open'])
  })

  it('does not mistake an option value for a positional', () => {
    expect(launch(['--trusted-host', 'a.example', 'b.example', '--no-open']).argv)
      .toEqual(['--profile', 'copera', '--trusted-host', 'a.example', 'b.example', '--no-open'])
  })

  it.each([
    [['headless']],
    [['headless', 'run the tests']],
    [['acp']],
    [['sdk']],
    [['sdk-minimal']],
    [['desktop']],
    [['plugin', 'list']],
    [['tui']],
    [['--no-open', 'extra']],
    [['web', 'web']],
    [['--', 'web']],
    [['--']],
  ])('rejects the mode or positional in %j', (argv) => {
    expect(rejection(argv)).toMatch(/^copera-code: /)
  })

  it.each([
    [['--profile', 'web']],
    [['--profile=web']],
    [['--profile', 'copera']],
    [['--patch', './extra.yml']],
    [['--from-default-profile', 'web']],
    [['--dump-config']],
    [['--dump-default-config']],
    [['--dump-config-schema']],
  ])('rejects the launcher option in %j', (argv) => {
    expect(rejection(argv)).toMatch(/not supported/)
  })
})

describe('resolveLaunch environment', () => {
  it('uses ~/.copera-code and ignores an inherited DSH_HOME', () => {
    expect(launch([], { DSH_HOME: '/dsh' }).env.DSH_HOME).toBe(`${HOME}/.copera-code`)
  })

  it('uses COPERA_CODE_HOME when set', () => {
    expect(launch([], { COPERA_CODE_HOME: '/x', DSH_HOME: '/dsh' }).env.DSH_HOME).toBe('/x')
  })

  it('treats a blank COPERA_CODE_HOME as unset', () => {
    expect(launch([], { COPERA_CODE_HOME: '  ' }).env.DSH_HOME).toBe(`${HOME}/.copera-code`)
  })

  it('always disables telemetry', () => {
    expect(launch([]).env.DSH_TELEMETRY_DISABLED).toBe('1')
    expect(launch([], { DSH_TELEMETRY_DISABLED: '0' }).env.DSH_TELEMETRY_DISABLED).toBe('1')
  })

  it('deletes an inherited DSH_COPERA_TOKEN without COPERA_CODE_TOKEN', () => {
    const result = launch([], { DSH_COPERA_TOKEN: 'injetado' })
    expect(result.env).toHaveProperty('DSH_COPERA_TOKEN')
    expect(result.env.DSH_COPERA_TOKEN).toBeUndefined()
  })

  it('passes COPERA_CODE_TOKEN on as DSH_COPERA_TOKEN', () => {
    expect(launch([], { COPERA_CODE_TOKEN: 'user-token', DSH_COPERA_TOKEN: 'injetado' }).env.DSH_COPERA_TOKEN).toBe('user-token')
  })

  it('deletes an inherited DSH_COPERA_API_ORIGIN without COPERA_CODE_API_ORIGIN', () => {
    const result = launch([], { DSH_COPERA_API_ORIGIN: 'https://attacker.example' })
    expect(result.env).toHaveProperty('DSH_COPERA_API_ORIGIN')
    expect(result.env.DSH_COPERA_API_ORIGIN).toBeUndefined()
  })

  it('passes an https COPERA_CODE_API_ORIGIN on', () => {
    expect(launch([], { COPERA_CODE_API_ORIGIN: 'https://api.staging.copera.ai' }).env.DSH_COPERA_API_ORIGIN)
      .toBe('https://api.staging.copera.ai')
  })

  it.each(['http://evil', 'not a url', 'file:///etc/passwd'])('rejects the non-https origin %s', (origin) => {
    expect(rejection([], { COPERA_CODE_API_ORIGIN: origin })).toMatch(/COPERA_CODE_API_ORIGIN/)
  })

  it('does not echo the rejected origin value', () => {
    expect(rejection([], { COPERA_CODE_API_ORIGIN: 'http://secret-host' })).not.toContain('secret-host')
  })
})

describe('resolveProductEnv', () => {
  it('returns exactly the four product variables', () => {
    expect(resolveProductEnv({ COPERA_CODE_TOKEN: 't', PATH: '/bin' }, HOME)).toEqual({
      DSH_HOME: `${HOME}/.copera-code`,
      DSH_TELEMETRY_DISABLED: '1',
      DSH_COPERA_TOKEN: 't',
      DSH_COPERA_API_ORIGIN: undefined,
    })
  })

  it('throws on a non-https origin', () => {
    expect(() => resolveProductEnv({ COPERA_CODE_API_ORIGIN: 'http://evil' }, HOME)).toThrow(/COPERA_CODE_API_ORIGIN/)
  })
})
