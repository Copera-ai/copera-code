/**
 * Check a packed `@copera.ai/code` tarball: its contents exclude the forbidden and excluded packages, it installs
 * into an empty directory, `copera-code --help` prints the Copera Code help, `copera-code --version` prints the
 * package version before the harness version, `copera-code headless`, `--profile=web`, and `--patch x` are refused, no
 * tests, `.env` files, nested tarballs, or source maps naming local paths ship, the Inter licence ships, the
 * openai-completions provider module loads without `@anthropic-ai/sdk`, and `copera-code --no-open --port 0` serves a
 * page titled "Copera Code".
 *
 * Usage: `pnpm exec tsx scripts/copera/verify-pack.ts --tarball <file.tgz> [--work <dir>]`. The install fetches the
 * platform optional dependencies from the npm registry; nothing contacts a Copera or DeepSeek host, and the
 * server runs without a Copera token.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { isEntry } from '../release/process.ts'
import { excludedBundles, indexPackages, isExcludedPackage } from './stage.ts'

/** The checkout the package was built from; its path must not appear in shipped source maps. */
const ROOT = resolve(import.meta.dirname, '../..')

/** How long the server may take to print its URL. */
const START_TIMEOUT_MS = 120_000

/**
 * List tarball entries that belong to an excluded package.
 * @param entries - Paths inside the tarball.
 * @returns The offending package roots, sorted and unique.
 */
export function excludedTarballEntries(entries: readonly string[]): string[] {
  const bundles = new Set(excludedBundles())
  const offending = new Set<string>()
  for (const entry of entries) {
    const segments = entry.split('/')
    for (let index = 0; index < segments.length; index++) {
      if (segments[index] !== 'node_modules') continue
      const scoped = segments[index + 1]?.startsWith('@') === true
      const name = scoped ? `${segments[index + 1] ?? ''}/${segments[index + 2] ?? ''}` : segments[index + 1] ?? ''
      if (isExcludedPackage(name, bundles)) offending.add(segments.slice(0, index + (scoped ? 3 : 2)).join('/'))
    }
  }
  return [...offending].sort()
}

/**
 * List tarball entries that must not ship: `.env` files and nested tarballs anywhere, and tests or specs of the
 * first-party packages (`@copera.ai/code` itself and every bundled `@deepseek-ai/*` package).
 * @param entries - Paths inside the tarball.
 * @returns The offending entries, sorted.
 */
export function strayTarballEntries(entries: readonly string[]): string[] {
  return entries.filter((entry) => {
    const base = entry.split('/').at(-1) ?? ''
    if (base.startsWith('.env') || base.endsWith('.tgz')) return true
    const firstParty = !entry.includes('/node_modules/') || /\/node_modules\/@deepseek-ai\/[^/]+\//u.test(entry)
    if (!firstParty) return false
    const local = entry.replace(/^.*\/node_modules\/@deepseek-ai\/[^/]+\//u, '')
    return /(?:^|\/)(?:tests?|__tests__)\//u.test(local) || /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(base)
  }).sort()
}

/**
 * List source maps whose text names a local absolute path.
 * @param files - Extracted source-map files and their contents.
 * @param localRoots - Absolute directories of the build machine, such as the checkout and the home directory.
 * @returns The offending source-map paths, sorted.
 */
export function sourceMapsWithLocalPaths(files: ReadonlyArray<{ path: string; text: string }>, localRoots: readonly string[]): string[] {
  return files.filter(file => localRoots.some(root => root !== '' && file.text.includes(root))).map(file => file.path).sort()
}

/**
 * Run a command to completion with a buffer large enough for a tarball listing.
 * @param command - Executable.
 * @param args - Arguments.
 * @param options - Working directory and environment.
 * @returns Exit status and captured output.
 */
function attempt(
  command: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, [...args], { ...options, encoding: 'utf8', maxBuffer: 1 << 30 })
  if (result.error !== undefined) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/**
 * Run a command and fail on a non-zero exit.
 * @param command - Executable.
 * @param args - Arguments.
 * @param options - Working directory and environment.
 * @returns Standard output.
 */
function capture(command: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const result = attempt(command, args, options)
  if (result.status !== 0) throw new Error(`verify-pack: ${command} ${args.join(' ')} exited with ${String(result.status)}:\n${result.stderr}`)
  return result.stdout
}

/** Environment of the installed command: no Node hooks, an isolated home, no inherited product variables. */
function productEnvironment(work: string): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  for (const name of Object.keys(environment)) {
    if (name.startsWith('COPERA_CODE_') || name.startsWith('DSH_') || name.startsWith('npm_')) Reflect.deleteProperty(environment, name)
  }
  delete environment.NODE_OPTIONS
  delete environment.NODE_PATH
  environment.COPERA_CODE_HOME = join(work, 'home')
  environment.DSH_AGENTS_HOME = join(work, 'agents')
  environment.DSH_TELEMETRY_DISABLED = '1'
  return environment
}

/** Fail with a message unless a condition holds. */
function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`verify-pack: ${message}`)
  console.log(`verify-pack: ok - ${message}`)
}

/**
 * Start the installed server, open the printed sign-in URL, and return the served page.
 * @param bin - Installed `copera-code` executable.
 * @param cwd - Working directory.
 * @param env - Product environment.
 * @returns The HTML of the application page.
 */
async function servedPage(bin: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  const child = spawn(process.execPath, [bin, '--no-open', '--port', '0'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  try {
    const url = await new Promise<string>((resolveUrl, rejectUrl) => {
      const timer = setTimeout(() => { rejectUrl(new Error(`no URL within ${String(START_TIMEOUT_MS)} ms:\n${output}`)) }, START_TIMEOUT_MS)
      const onData = (chunk: Buffer): void => {
        output += chunk.toString()
        const match = /https?:\/\/127\.0\.0\.1:\d+\/\S*/.exec(output)
        if (match !== null) { clearTimeout(timer); resolveUrl(match[0]) }
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      child.once('exit', (code) => { clearTimeout(timer); rejectUrl(new Error(`copera-code exited with ${String(code)}:\n${output}`)) })
    })
    const login = await fetch(url, { redirect: 'manual' })
    const cookie = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
    const location = new URL(login.headers.get('location') ?? '/', url)
    const page = await fetch(location, { headers: cookie === '' ? {} : { cookie } })
    if (!page.ok) throw new Error(`GET ${location.pathname} returned ${String(page.status)}`)
    return await page.text()
  } finally {
    child.kill('SIGINT')
    const exited = await new Promise<boolean>((resolveExit) => {
      if (child.exitCode !== null || child.signalCode !== null) { resolveExit(true); return }
      const timer = setTimeout(() => { resolveExit(false) }, 15_000)
      child.once('exit', () => { clearTimeout(timer); resolveExit(true) })
    })
    if (!exited) child.kill('SIGKILL')
  }
}

/** Run every check against `--tarball`. */
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { tarball: { type: 'string' }, work: { type: 'string' }, keep: { type: 'boolean', default: false } } })
  if (values.tarball === undefined) throw new Error('usage: verify-pack.ts --tarball <file.tgz> [--work <dir>] [--keep]')
  const tarball = resolve(values.tarball)
  const work = values.work === undefined ? mkdtempSync(join(tmpdir(), 'copera-code-verify-')) : resolve(values.work)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  try {
    const entries = capture('tar', ['-tzf', tarball]).split(/\r?\n/u).filter(line => line !== '')
    const excluded = excludedTarballEntries(entries)
    check(excluded.length === 0, `the tarball (${String(entries.length)} entries) contains no excluded package${excluded.length === 0 ? '' : `: ${excluded.join(', ')}`}`)

    const stray = strayTarballEntries(entries)
    check(stray.length === 0, `the tarball contains no tests, .env files, or nested tarballs${stray.length === 0 ? '' : `: ${stray.slice(0, 20).join(', ')}`}`)
    const extracted = join(work, 'extracted')
    mkdirSync(extracted)
    capture('tar', ['-xzf', tarball, '-C', extracted])
    const maps = entries.filter(entry => entry.endsWith('.map'))
      .map(entry => ({ path: entry, text: readFileSync(join(extracted, entry), 'utf8') }))
    const leaking = sourceMapsWithLocalPaths(maps, [ROOT, homedir()])
    check(leaking.length === 0, `no source map (${String(maps.length)} checked) names a local absolute path${leaking.length === 0 ? '' : `: ${leaking.slice(0, 20).join(', ')}`}`)
    const interLicense = join(extracted, 'package', 'OFL-Inter.txt')
    check(existsSync(interLicense) && readFileSync(interLicense, 'utf8').startsWith('Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)\n')
      && readFileSync(interLicense, 'utf8').includes('SIL OPEN FONT LICENSE Version 1.1'), 'the package ships the Inter licence (OFL-1.1) beside THIRD_PARTY_NOTICES.md')

    const consumer = join(work, 'consumer')
    mkdirSync(consumer)
    writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({ name: 'copera-code-verify', version: '0.0.0', private: true, dependencies: { '@copera.ai/code': pathToFileURL(tarball).href } }, null, 2)}\n`)
    const env = productEnvironment(work)
    capture('npm', ['install', '--cache', join(work, '.npm-cache'), '--no-audit', '--no-fund', '--package-lock=false', '--loglevel=error'], { cwd: consumer, env })
    const installed = [...indexPackages(join(consumer, 'node_modules')).values()]
    const installedExcluded = installed.map(pkg => pkg.manifest.name ?? '').filter(name => isExcludedPackage(name, new Set(excludedBundles())))
    check(installedExcluded.length === 0, `the installed tree (${String(installed.length)} packages) contains no excluded package${installedExcluded.length === 0 ? '' : `: ${installedExcluded.join(', ')}`}`)

    const bin = join(consumer, 'node_modules', '@copera.ai', 'code', 'bin', 'copera-code.mjs')
    check(existsSync(join(consumer, 'node_modules', '.bin', 'copera-code')), 'npm linked the copera-code bin')
    const help = attempt(process.execPath, [bin, '--help'], { cwd: consumer, env })
    check(help.status === 0, 'copera-code --help exits with 0')
    check(help.stdout.includes('Copera Code') && help.stdout.includes('Usage: copera-code'), 'copera-code --help names Copera Code')
    check(!help.stdout.includes('DeepSeek Harness') && !/\bdsh\b/.test(help.stdout), 'copera-code --help names neither DeepSeek Harness nor dsh')

    const version = attempt(process.execPath, [bin, '--version'], { cwd: consumer, env })
    const productVersion = (JSON.parse(readFileSync(join(consumer, 'node_modules', '@copera.ai', 'code', 'package.json'), 'utf8')) as { version: string }).version
    const printed = version.stdout.trim()
    check(version.status === 0 && printed.startsWith(`${productVersion} (harness `) && printed.endsWith(')'), `copera-code --version prints ${productVersion} before the harness version`)

    const headless = attempt(process.execPath, [bin, 'headless'], { cwd: consumer, env })
    check(headless.status !== 0 && headless.stderr.includes('not supported'), 'copera-code headless is refused')
    for (const args of [['--profile=web'], ['--patch', 'x.yml']]) {
      const refused = attempt(process.execPath, [bin, ...args], { cwd: consumer, env })
      check(refused.status !== 0 && refused.stderr.includes('is not supported'), `copera-code ${args.join(' ')} is refused`)
    }

    const piAi = installed.find(pkg => pkg.manifest.name === '@earendil-works/pi-ai')
    if (piAi === undefined) throw new Error('verify-pack: the installed tree has no @earendil-works/pi-ai')
    check(!installed.some(pkg => pkg.manifest.name === '@anthropic-ai/sdk'), 'the installed tree has no @anthropic-ai/sdk')
    const completions = pathToFileURL(join(piAi.dir, 'dist', 'api', 'openai-completions.js')).href
    const load = attempt(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(completions)}); console.log('loaded')`], { cwd: consumer, env })
    check(load.status === 0 && load.stdout.includes('loaded'), 'the openai-completions provider module of the copera route loads without @anthropic-ai/sdk')

    const page = await servedPage(bin, consumer, env)
    check(/<title>Copera Code<\/title>/.test(page), 'the served page is titled "Copera Code"')
    console.log('verify-pack: all checks passed')
  } finally {
    if (!values.keep) rmSync(work, { recursive: true, force: true })
  }
}

if (isEntry(import.meta.url)) await main()
