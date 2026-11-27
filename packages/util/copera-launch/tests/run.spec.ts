import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { portInUse, runCoperaCode, webServerConfigured } from '../src/index.ts'

const servers: Server[] = []

afterEach(async () => {
  process.exitCode = undefined
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => { server.close(() => { resolve() }) })))
})

/** Listen on an OS-assigned loopback port owned by this spec. */
async function occupiedPort(): Promise<number> {
  const server = createServer()
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no TCP address')
  return address.port
}

/** Run the command against a fake process and capture what reached the CLI. */
interface RunOptions { env?: NodeJS.ProcessEnv; busy?: boolean; productVersion?: string; configured?: boolean }

async function run(args: string[], options: RunOptions = {}) {
  const env: NodeJS.ProcessEnv = { ...options.env }
  const argv = ['node', 'copera-code', ...args]
  const errors: string[] = []
  const probes: [number, string][] = []
  const configuredHomes: string[] = []
  const seen: { argv?: string[]; env?: NodeJS.ProcessEnv; binName?: string | undefined; productVersion?: string | undefined } = {}
  const runCli = vi.fn(async (cliOptions: { binName?: string; productVersion?: string }) => {
    seen.argv = argv.slice(2)
    seen.env = { ...env }
    seen.binName = cliOptions.binName
    seen.productVersion = cliOptions.productVersion
    await Promise.resolve()
  })
  await runCoperaCode({
    argv,
    env,
    homedir: '/home/someone',
    runCli,
    portInUse: async (port, host) => {
      probes.push([port, host])
      return await Promise.resolve(options.busy === true)
    },
    writeError: (message) => { errors.push(message) },
    productVersion: options.productVersion,
    webServerConfigured: (home) => { configuredHomes.push(home); return options.configured === true },
  })
  return { runCli, seen, errors, probes, configuredHomes }
}

describe('runCoperaCode', () => {
  it('runs the CLI as copera-code with the copera profile and the product environment', async () => {
    const { seen, probes } = await run([], { env: { DSH_HOME: '/dsh', DSH_COPERA_TOKEN: 'injetado', COPERA_CODE_TOKEN: 'mine' } })
    expect(seen.binName).toBe('copera-code')
    expect(seen.argv).toEqual(['--profile', 'copera'])
    expect(seen.env).toEqual({ DSH_HOME: '/home/someone/.copera-code', DSH_TELEMETRY_DISABLED: '1', DSH_COPERA_TOKEN: 'mine', COPERA_CODE_TOKEN: 'mine' })
    expect(probes).toEqual([[3080, '127.0.0.1']])
  })

  it('passes the product version to the CLI only when the package names one', async () => {
    expect((await run(['--version'], { productVersion: '0.1.0' })).seen.productVersion).toBe('0.1.0')
    expect((await run(['--version'])).runCli.mock.calls[0]?.[0]).toEqual({ binName: 'copera-code' })
  })

  it('passes the product version on as DSH_COPERA_PRODUCT_VERSION and never an inherited one', async () => {
    expect((await run([], { productVersion: '0.1.0', env: { DSH_COPERA_PRODUCT_VERSION: '9.9.9' } })).seen.env?.DSH_COPERA_PRODUCT_VERSION).toBe('0.1.0')
    expect((await run([], { env: { DSH_COPERA_PRODUCT_VERSION: '9.9.9' } })).seen.env).not.toHaveProperty('DSH_COPERA_PRODUCT_VERSION')
  })

  it('deletes product variables the user did not set', async () => {
    const { seen } = await run([], { env: { DSH_COPERA_TOKEN: 'injetado', DSH_COPERA_API_ORIGIN: 'https://attacker.example' } })
    expect(seen.env).not.toHaveProperty('DSH_COPERA_TOKEN')
    expect(seen.env).not.toHaveProperty('DSH_COPERA_API_ORIGIN')
  })

  it('falls back to an OS-assigned port when 3080 is busy and no port was named', async () => {
    expect((await run(['web', '--no-open'], { busy: true })).seen.argv).toEqual(['--profile', 'copera', '--no-open', '--port', '0'])
  })

  it('probes the named host', async () => {
    expect((await run(['--host', '::1'])).probes).toEqual([[3080, '::1']])
    expect((await run(['--host=localhost'])).probes).toEqual([[3080, 'localhost']])
  })

  it.each([[['--port', '4000']], [['--port=4000']], [['--help']], [['--version']]])('keeps %j without probing', async (args) => {
    const { seen, probes } = await run(args, { busy: true })
    expect(seen.argv).toEqual(['--profile', 'copera', ...args])
    expect(probes).toEqual([])
  })

  it('prints the version when --version follows --no-open, without probing', async () => {
    const { seen, probes } = await run(['--no-open', '--version'], { busy: true })
    expect(seen.argv).toEqual(['--profile', 'copera', '--version'])
    expect(probes).toEqual([])
  })

  it('keeps the port a profile or home patch configures when 3080 is busy', async () => {
    const { seen, probes, configuredHomes } = await run(['--no-open'], { busy: true, configured: true, env: { COPERA_CODE_HOME: '/data/copera' } })
    expect(seen.argv).toEqual(['--profile', 'copera', '--no-open'])
    expect(probes).toEqual([])
    expect(configuredHomes).toEqual(['/data/copera'])
  })

  it('prints a rejected launch and does not start the CLI', async () => {
    const { runCli, errors } = await run(['headless'])
    expect(runCli).not.toHaveBeenCalled()
    expect(errors).toEqual([expect.stringMatching(/^copera-code: "headless" is not supported/)])
    expect(process.exitCode).toBe(1)
  })
})

describe('portInUse', () => {
  it('reports a bound port as in use', async () => {
    expect(await portInUse(await occupiedPort(), '127.0.0.1')).toBe(true)
  })

  it('reports a bindable port as free', async () => {
    // Port 0 always binds, so no other process can make this probe flaky.
    expect(await portInUse(0, '127.0.0.1')).toBe(false)
  })
})

describe('webServerConfigured', () => {
  const homes: string[] = []
  afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })
  const home = (): string => { const path = mkdtempSync(join(tmpdir(), 'copera-launch-home-')); homes.push(path); return path }

  it('is false without patch files or with patches of other rows', () => {
    const empty = home()
    expect(webServerConfigured(empty)).toBe(false)
    writeFileSync(join(empty, 'cordis.patch.yml'), '- id: ui-theme\n  config:\n    preference: light\n')
    expect(webServerConfigured(empty)).toBe(false)
  })

  it('is true when the home patch configures the webserver row', () => {
    const path = home()
    writeFileSync(join(path, 'cordis.patch.yml'), '- id: webserver\n  config:\n    port: 4000\n')
    expect(webServerConfigured(path)).toBe(true)
  })

  it('is true when the copera profile patch configures the webserver row', () => {
    const path = home()
    mkdirSync(join(path, 'profiles', 'copera'), { recursive: true })
    writeFileSync(join(path, 'profiles', 'copera', 'cordis.patch.yml'), '- id: webserver\n  config:\n    port: 4000\n')
    expect(webServerConfigured(path)).toBe(true)
  })

  it('leaves an unreadable patch to the boot, which reports it', () => {
    const path = home()
    writeFileSync(join(path, 'cordis.patch.yml'), ': not a patch list')
    expect(webServerConfigured(path)).toBe(true)
  })
})
