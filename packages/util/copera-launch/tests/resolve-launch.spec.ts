import { resolve } from 'node:path'
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

  it.each([
    [['--port', '4000']], [['--port=4000']], [['--port', '0']], [['--host', '127.0.0.1']], [['--host=::1']],
    [['--host', 'localhost']], [['--no-open']], [['-h']], [['-V']], [['--help']], [['--version']],
  ])('accepts the local-use flag %j', (argv) => {
    expect(launch(argv).argv).toEqual(['--profile', 'copera', ...argv])
  })

  it.each([
    [['--no-open', '--version'], '--version'],
    [['--port', '4000', '-h'], '-h'],
    [['--host=::1', '-V', '--help'], '-V'],
  ])('runs only the first information flag of %j', (argv, flag) => {
    expect(launch(argv).argv).toEqual(['--profile', 'copera', flag])
  })

  it.each([
    [['--public-url', 'https://a.example/']], [['--public-url=https://a.example/']], [['--trusted-host', 'a.example']],
    [['--trusted-host=a.example']], [['--tls-cert', 'c.pem']], [['--tls-key=k.pem']], [['--patch', 'x.yml']],
    [['--patch=x.yml']], [['--profile=web']], [['--dump-config']],
  ])('refuses the remote-serving or profile flag %j', (argv) => {
    expect(rejection(argv)).toMatch(/^copera-code: --[a-z-]+ is not supported/)
  })

  it.each([
    [['--host', '0.0.0.0']], [['--host=10.0.0.7']], [['--host', '[::1]']], [['--host']], [['--host', '--no-open']],
  ])('refuses the non-loopback or missing host in %j without echoing it', (argv) => {
    const error = rejection(argv)
    expect(error).toMatch(/^copera-code: --host must be 127\.0\.0\.1, ::1, or localhost/)
    expect(error).not.toContain('10.0.0.7')
    expect(error).not.toContain('0.0.0.0')
  })

  it.each([[['--port', 'abc']], [['--port=99999']], [['--port']], [['--port=-1']]])('refuses the invalid port in %j', (argv) => {
    expect(rejection(argv)).toMatch(/^copera-code: --port must be a number from 0 to 65535/)
  })

  it.each([[['--unknown']], [['--no-opens']], [['--open']], [['-x']], [['--port4000']]])('refuses the unknown flag %j', (argv) => {
    expect(rejection(argv)).toMatch(/^copera-code: unknown option --?[a-z0-9-]+; run copera-code --help/)
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
    expect(launch([], { COPERA_CODE_HOME: '' }).env.DSH_HOME).toBe(`${HOME}/.copera-code`)
  })

  it('trims COPERA_CODE_HOME, expands ~, and makes it absolute', () => {
    expect(launch([], { COPERA_CODE_HOME: '  /data/copera  ' }).env.DSH_HOME).toBe('/data/copera')
    expect(launch([], { COPERA_CODE_HOME: '~' }).env.DSH_HOME).toBe(HOME)
    expect(launch([], { COPERA_CODE_HOME: '~/copera' }).env.DSH_HOME).toBe(`${HOME}/copera`)
    expect(launch([], { COPERA_CODE_HOME: 'relative/home' }).env.DSH_HOME).toBe(resolve('relative/home'))
    expect(launch([], { COPERA_CODE_HOME: '~other/x' }).env.DSH_HOME).toBe(resolve('~other/x'))
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

  it.each([
    'http://evil', 'not a url', 'file:///etc/passwd', 'http://localhost:8080', 'https://api.example/path',
    'https://user:pass@api.example', 'https://api.example/?q=1', 'https://api.example/#frag', 'http://10.0.0.7:80',
  ])('rejects the origin %s without echoing it', (origin) => {
    const error = rejection([], { COPERA_CODE_API_ORIGIN: origin })
    expect(error).toMatch(/COPERA_CODE_API_ORIGIN must be an https origin/)
    expect(error).not.toContain(origin)
    expect(error).not.toMatch(/evil|example|pass|10\.0\.0\.7|localhost/)
  })

  it.each([
    ['https://api.example', 'https://api.example'], ['https://api.example/', 'https://api.example'],
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080'], ['http://[::1]:9000/', 'http://[::1]:9000'],
  ])('accepts the bare origin %s as %s', (origin, normalized) => {
    expect(launch([], { COPERA_CODE_API_ORIGIN: origin }).env.DSH_COPERA_API_ORIGIN).toBe(normalized)
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
