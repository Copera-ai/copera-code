/**
 * Pure argument and environment resolution for the `copera-code` command.
 *
 * The harness loads the opened project's `.env` into its process and protects only `DSH_*` names from it, so the
 * user-facing `COPERA_CODE_*` variables are read here, from the real process environment, and handed on under
 * their protected `DSH_*` names. Every product variable is either set or deleted, never inherited.
 * @module @deepseek-ai/dsh-copera-launch/resolve-launch
 */

import { join, resolve } from 'node:path'

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

/**
 * Options the command refuses by name: launcher options that select or rewrite another profile tree, and Web
 * options that serve beyond this computer (an advertised public URL, extra trusted authorities, TLS).
 */
const UNSUPPORTED_OPTIONS = new Set([
  '--profile', '--patch', '--from-default-profile', '--dump-config', '--dump-default-config', '--dump-config-schema',
  '--public-url', '--trusted-host', '--tls-cert', '--tls-key',
])

/** Options that print help or the version and exit. */
const INFO_OPTIONS = new Set(['-h', '--help', '-V', '--version'])

/** Bind addresses `--host` accepts: the loopback interface only. */
const LOOPBACK_BIND_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

/** Hosts a plain `http:` API origin may name: a local Copera API stand-in. */
const LOOPBACK_ORIGIN_HOSTS = new Set(['127.0.0.1', '[::1]'])

/**
 * Map the real process environment to the product environment the harness reads.
 * `DSH_HOME` is `COPERA_CODE_HOME` (trimmed, a leading `~` expanded, made absolute) or `<homedir>/.copera-code`,
 * ignoring an inherited `DSH_HOME`; `DSH_TELEMETRY_DISABLED` is always `1`; `DSH_COPERA_TOKEN` and
 * `DSH_COPERA_API_ORIGIN` come only from `COPERA_CODE_TOKEN` and `COPERA_CODE_API_ORIGIN` and are `undefined`
 * (to delete) otherwise.
 * @param env - The real process environment, before any `.env` file is loaded.
 * @param homedir - The operating-system home directory.
 * @returns Exactly the four product variables; `undefined` values must be deleted.
 * @throws Error if `COPERA_CODE_API_ORIGIN` is set and is not a bare `https:` origin (or `http:` on
 *   `127.0.0.1`/`[::1]`).
 */
export function resolveProductEnv(env: NodeJS.ProcessEnv, homedir: string): Record<string, string | undefined> {
  const token = env.COPERA_CODE_TOKEN
  return {
    DSH_HOME: productHome(env.COPERA_CODE_HOME, homedir),
    DSH_TELEMETRY_DISABLED: '1',
    DSH_COPERA_TOKEN: token !== undefined && token !== '' ? token : undefined,
    DSH_COPERA_API_ORIGIN: apiOrigin(env.COPERA_CODE_API_ORIGIN),
  }
}

/**
 * Resolve the data home.
 * @param value - The raw `COPERA_CODE_HOME` value.
 * @param homedir - The operating-system home directory.
 * @returns An absolute directory: the trimmed value with `~` or a leading `~/` expanded, resolved against the working
 *   directory, or `<homedir>/.copera-code` when the value is unset or blank.
 */
function productHome(value: string | undefined, homedir: string): string {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') return join(homedir, COPERA_CODE_HOME_DIR_NAME)
  if (trimmed === '~') return homedir
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return join(homedir, trimmed.slice(2))
  return resolve(trimmed)
}

/**
 * Validate the API origin override with the rule the Copera plugins apply; the value never appears in the error.
 * @param value - The raw `COPERA_CODE_API_ORIGIN` value.
 * @returns The normalized origin, or `undefined` when unset or empty.
 * @throws Error unless the value is an `https:` origin, or an `http:` origin on `127.0.0.1` or `[::1]`, without
 *   credentials, path, query, or fragment.
 */
function apiOrigin(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  const url = URL.parse(value)
  const secure = url?.protocol === 'https:' || (url?.protocol === 'http:' && LOOPBACK_ORIGIN_HOSTS.has(url.hostname))
  if (url === null || !secure || url.username !== '' || url.password !== '' || url.pathname !== '/'
    || url.search !== '' || url.hash !== '') {
    throw new Error(`${COPERA_CODE_BIN}: COPERA_CODE_API_ORIGIN must be an https origin without credentials, path, query, or fragment (http only for 127.0.0.1 or [::1])`)
  }
  return url.origin
}

/**
 * Resolve `copera-code` arguments and environment into one dsh CLI launch of the `copera` profile.
 * A leading `web` is an alias for no mode and is dropped. The accepted options are an allowlist for local use:
 * `-h`/`--help`, `-V`/`--version`, `--port <0-65535>`, `--host <127.0.0.1|::1|localhost>`, and `--no-open`, each
 * also in `--name=value` form. When an information option is present, only the first one is passed on, so
 * `--no-open --version` prints the version. Other upstream modes, positionals, and options are refused.
 * @param argv - Arguments after the Node binary and script.
 * @param env - The real process environment, before any `.env` file is loaded.
 * @param homedir - The operating-system home directory.
 * @returns The CLI argv and environment overlay, or the error to print.
 */
export function resolveLaunch(argv: string[], env: NodeJS.ProcessEnv, homedir: string): ResolvedLaunch | RejectedLaunch {
  const args = argv[0] === 'web' ? argv.slice(1) : [...argv]
  const error = argumentError(args)
  if (error !== undefined) return { error }
  const info = args.find(arg => INFO_OPTIONS.has(arg))
  try {
    return { argv: ['--profile', COPERA_PROFILE, ...info === undefined ? args : [info]], env: resolveProductEnv(env, homedir) }
  } catch (failure) {
    return { error: (failure as Error).message }
  }
}

/**
 * Find the first argument the command does not accept. Option values are validated but never echoed.
 * @param args - Arguments after the optional `web` alias.
 * @returns The error message, or `undefined` when every argument is accepted.
 */
function argumentError(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] as string
    if (!arg.startsWith('-') || arg === '--') return positionalError(arg === '--' ? args[index + 1] ?? '--' : arg)
    const separator = arg.indexOf('=')
    const name = separator < 0 ? arg : arg.slice(0, separator)
    if (UNSUPPORTED_OPTIONS.has(name)) {
      return `${COPERA_CODE_BIN}: ${name} is not supported; ${COPERA_CODE_BIN} always runs the Copera Code profile on this computer`
    }
    if (separator < 0 && (INFO_OPTIONS.has(name) || name === '--no-open')) continue
    if (name !== '--port' && name !== '--host') return `${COPERA_CODE_BIN}: unknown option ${name}; run ${COPERA_CODE_BIN} --help for the supported options`
    let value: string | undefined
    if (separator >= 0) value = arg.slice(separator + 1)
    else {
      value = args[index + 1]
      if (value?.startsWith('-') === true) value = undefined
      else index++
    }
    if (name === '--port' && (value === undefined || !/^\d{1,5}$/u.test(value) || Number(value) > 65_535)) {
      return `${COPERA_CODE_BIN}: --port must be a number from 0 to 65535`
    }
    if (name === '--host' && (value === undefined || !LOOPBACK_BIND_HOSTS.has(value))) {
      return `${COPERA_CODE_BIN}: --host must be 127.0.0.1, ::1, or localhost; ${COPERA_CODE_BIN} serves only this computer`
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
