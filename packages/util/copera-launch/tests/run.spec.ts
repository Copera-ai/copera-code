import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { portInUse, runCoperaCode } from '../src/index.ts'

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
async function run(args: string[], options: { env?: NodeJS.ProcessEnv; busy?: boolean; productVersion?: string } = {}) {
  const env: NodeJS.ProcessEnv = { ...options.env }
  const argv = ['node', 'copera-code', ...args]
  const errors: string[] = []
  const probes: [number, string][] = []
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
  })
  return { runCli, seen, errors, probes }
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
    expect((await run(['--host=10.0.0.7'])).probes).toEqual([[3080, '10.0.0.7']])
  })

  it.each([[['--port', '4000']], [['--port=4000']], [['--help']], [['--version']]])('keeps %j without probing', async (args) => {
    const { seen, probes } = await run(args, { busy: true })
    expect(seen.argv).toEqual(['--profile', 'copera', ...args])
    expect(probes).toEqual([])
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
