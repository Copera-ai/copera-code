/**
 * Pure argument and environment resolution for the `copera-code` command.
 *
 * The harness loads the opened project's `.env` into its process and protects only `DSH_*` names from it, so the
 * user-facing `COPERA_CODE_*` variables are read here, from the real process environment, and handed on under
 * their protected `DSH_*` names. Every product variable is either set or deleted, never inherited.
 * @module @deepseek-ai/dsh-copera-launch/resolve-launch
 */

import { join } from 'node:path'

/** The command name printed in help and errors. */
export const COPERA_CODE_BIN = 'copera-code'

/** The only profile the command boots. */
export const COPERA_PROFILE = 'copera'

/** Directory name of the default Copera Code home under the operating-system home. */
export const COPERA_CODE_HOME_DIR_NAME = '.copera-code'

/** A resolved launch: the CLI argv to run and the environment overlay to apply (`undefined` deletes). */
export interface ResolvedLaunch {
  /** Arguments for the dsh CLI, after the Node binary and script. */
  argv: string[]
  /** Environment overlay; a key mapped to `undefined` must be deleted from the process environment. */
  env: Record<string, string | undefined>
}

/** A launch the command refuses, with the message to print. */
export interface RejectedLaunch {
  /** One-line message prefixed with the command name. */
  error: string
}

/** Upstream modes that name another product profile or a management command. */
const UNSUPPORTED_MODES = new Set(['headless', 'acp', 'sdk', 'sdk-minimal', 'desktop', 'plugin'])

/** Launcher options that select or rewrite another profile tree. */
const UNSUPPORTED_OPTIONS = new Set([
  '--profile', '--patch', '--from-default-profile', '--dump-config', '--dump-default-config', '--dump-config-schema',
])

/** Web application options that take one value. */
const VALUE_OPTIONS = new Set(['--host', '--port', '--public-url', '--tls-cert', '--tls-key'])

/** Web application options that take every following value up to the next option. */
const VARIADIC_OPTIONS = new Set(['--trusted-host'])

/**
 * Map the real process environment to the product environment the harness reads.
 * `DSH_HOME` is `COPERA_CODE_HOME` or `<homedir>/.copera-code`, ignoring an inherited `DSH_HOME`;
 * `DSH_TELEMETRY_DISABLED` is always `1`; `DSH_COPERA_TOKEN` and `DSH_COPERA_API_ORIGIN` come only from
 * `COPERA_CODE_TOKEN` and `COPERA_CODE_API_ORIGIN` and are `undefined` (to delete) otherwise.
 * @param env - The real process environment, before any `.env` file is loaded.
 * @param homedir - The operating-system home directory.
 * @returns Exactly the four product variables; `undefined` values must be deleted.
 * @throws Error if `COPERA_CODE_API_ORIGIN` is set and is not an `https:` URL.
 */
export function resolveProductEnv(env: NodeJS.ProcessEnv, homedir: string): Record<string, string | undefined> {
  const home = env.COPERA_CODE_HOME
  const token = env.COPERA_CODE_TOKEN
  return {
    DSH_HOME: home !== undefined && home.trim() !== '' ? home : join(homedir, COPERA_CODE_HOME_DIR_NAME),
    DSH_TELEMETRY_DISABLED: '1',
    DSH_COPERA_TOKEN: token !== undefined && token !== '' ? token : undefined,
    DSH_COPERA_API_ORIGIN: httpsOrigin(env.COPERA_CODE_API_ORIGIN),
  }
}

/**
 * Validate the API origin override; the value itself never appears in the error.
 * @param value - The raw `COPERA_CODE_API_ORIGIN` value.
 * @returns The value when it is an `https:` URL, or `undefined` when unset or empty.
 * @throws Error if the value is set and is not an `https:` URL.
 */
function httpsOrigin(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  if (URL.parse(value)?.protocol !== 'https:') {
    throw new Error(`${COPERA_CODE_BIN}: COPERA_CODE_API_ORIGIN must be an https:// URL`)
  }
  return value
}

/**
 * Resolve `copera-code` arguments and environment into one dsh CLI launch of the `copera` profile.
 * A leading `web` is an alias for no mode and is dropped. Other upstream modes, any other positional, and the
 * launcher options that select or rewrite a profile (`--profile`, `--patch`, `--from-default-profile`, the
 * config dumps) are rejected. Web options such as `--help`, `--version`, `--port`, `--host`, and `--no-open` pass
 * through in order.
 * @param argv - Arguments after the Node binary and script.
 * @param env - The real process environment, before any `.env` file is loaded.
 * @param homedir - The operating-system home directory.
 * @returns The CLI argv and environment overlay, or the error to print.
 */
export function resolveLaunch(argv: string[], env: NodeJS.ProcessEnv, homedir: string): ResolvedLaunch | RejectedLaunch {
  const args = argv[0] === 'web' ? argv.slice(1) : [...argv]
  const error = argumentError(args)
  if (error !== undefined) return { error }
  try {
    return { argv: ['--profile', COPERA_PROFILE, ...args], env: resolveProductEnv(env, homedir) }
  } catch (failure) {
    return { error: (failure as Error).message }
  }
}

/**
 * Find the first argument the command does not support.
 * @param args - Arguments after the optional `web` alias.
 * @returns The error message, or `undefined` when every argument is supported.
 */
function argumentError(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] as string
    if (!arg.startsWith('-') || arg === '--') return positionalError(arg === '--' ? args[index + 1] ?? '--' : arg)
    const name = arg.split('=', 1)[0] as string
    if (UNSUPPORTED_OPTIONS.has(name)) {
      return `${COPERA_CODE_BIN}: ${name} is not supported; ${COPERA_CODE_BIN} always runs the Copera Code profile`
    }
    if (arg.includes('=')) continue
    if (VALUE_OPTIONS.has(name)) index++
    else if (VARIADIC_OPTIONS.has(name)) {
      while (index + 1 < args.length && !(args[index + 1] as string).startsWith('-')) index++
    }
  }
  return undefined
}

/**
 * Describe an unsupported mode or positional argument.
 * @param arg - The offending argument.
 * @returns The error message.
 */
function positionalError(arg: string): string {
  if (UNSUPPORTED_MODES.has(arg)) {
    return `${COPERA_CODE_BIN}: "${arg}" is not supported in this version; run ${COPERA_CODE_BIN} to start the Copera Code web app`
  }
  return `${COPERA_CODE_BIN}: unexpected argument ${JSON.stringify(arg)}; run ${COPERA_CODE_BIN} --help for the supported options`
}
