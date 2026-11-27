/**
 * The `copera-code` command: resolve the launch, apply it to this process, and run the dsh CLI.
 * @module @deepseek-ai/dsh-copera-launch/run
 */

import { createServer } from 'node:net'
import { homedir } from 'node:os'
import type { RunCliOptions } from '@deepseek-ai/dsh/lib/bin.js'
import { COPERA_CODE_BIN, resolveLaunch } from './resolve-launch.ts'

/** Port the Web application listens on when neither the profile nor `--port` names another. */
export const DEFAULT_WEB_PORT = 3080

/** Process-facing operations {@link runCoperaCode} uses; tests replace them. */
export interface CoperaCodeRuntime {
  /** Run the dsh CLI over the current `process.argv` and `process.env`. */
  runCli: (options: RunCliOptions) => Promise<void>
  /** Report whether a TCP port on a host cannot be bound. */
  portInUse: (port: number, host: string) => Promise<boolean>
  /** Real process environment. */
  env: NodeJS.ProcessEnv
  /** Operating-system home directory. */
  homedir: string
  /** Process arguments, Node binary and script first. */
  argv: string[]
  /** Print a usage error. */
  writeError: (message: string) => void
  /** Version of the Copera Code package; `--version` prints it before the harness version. */
  productVersion: string | undefined
}

/**
 * Report whether a TCP port on a host cannot be bound right now.
 * @param port - Port to probe.
 * @param host - Bind address to probe.
 * @returns `true` when binding fails, `false` when the port was free and has been released again.
 */
export async function portInUse(port: number, host: string): Promise<boolean> {
  const server = createServer()
  return await new Promise<boolean>((resolve) => {
    server.once('error', () => { resolve(true) })
    server.listen({ port, host, exclusive: true }, () => { server.close(() => { resolve(false) }) })
  })
}

/**
 * Run Copera Code: apply {@link resolveLaunch} to `process.argv` and `process.env`, add `--port 0` when the user
 * named no port and the default port is busy, and run the dsh CLI as `copera-code`. A rejected launch prints its
 * error and sets exit code 1 without starting the CLI.
 * @param runtime - Process-facing operations and the product version; defaults to this process, the installed dsh
 *   CLI, and no product version.
 * @returns Completion of the CLI command.
 */
export async function runCoperaCode(runtime: Partial<CoperaCodeRuntime> = {}): Promise<void> {
  const { argv, env, homedir: home, portInUse: probe, runCli, writeError, productVersion } = { ...processRuntime(), ...runtime }
  const launch = resolveLaunch(argv.slice(2), env, home)
  if ('error' in launch) {
    writeError(launch.error)
    process.exitCode = 1
    return
  }
  const args = launch.argv.slice(2)
  if (!args.some(isPortOrInfoFlag) && await probe(DEFAULT_WEB_PORT, hostArgument(args) ?? '127.0.0.1')) {
    launch.argv.push('--port', '0')
  }
  for (const [name, value] of Object.entries(launch.env)) {
    if (value === undefined) Reflect.deleteProperty(env, name)
    else env[name] = value
  }
  argv.splice(2, argv.length - 2, ...launch.argv)
  await runCli({ binName: COPERA_CODE_BIN, ...productVersion === undefined ? {} : { productVersion } })
}

/* v8 ignore start -- process-bound defaults; scripts/copera/verify-pack.ts drives them through the installed command. */
/**
 * The operations of this process and the installed dsh CLI.
 * @returns The default runtime of {@link runCoperaCode}.
 */
function processRuntime(): CoperaCodeRuntime {
  return {
    runCli: async (options) => { await (await import('@deepseek-ai/dsh/lib/bin.js')).runCli(options) },
    portInUse,
    env: process.env,
    homedir: homedir(),
    argv: process.argv,
    writeError: (message) => { process.stderr.write(`${message}\n`) },
    productVersion: undefined,
  }
}
/* v8 ignore stop */

/**
 * Whether an argument names the port or prints information without serving.
 * @param arg - One Web argument.
 * @returns `true` for `--port`, `--port=<n>`, help, and version flags.
 */
function isPortOrInfoFlag(arg: string): boolean {
  return arg === '--port' || arg.startsWith('--port=') || ['-h', '--help', '-V', '--version'].includes(arg)
}

/**
 * Read the `--host` value from Web arguments.
 * @param args - Web arguments after the profile selection.
 * @returns The host, or `undefined` when none is named.
 */
function hostArgument(args: readonly string[]): string | undefined {
  const index = args.findIndex(arg => arg === '--host' || arg.startsWith('--host='))
  if (index < 0) return undefined
  const arg = args[index] as string
  return arg === '--host' ? args[index + 1] : arg.slice('--host='.length)
}
