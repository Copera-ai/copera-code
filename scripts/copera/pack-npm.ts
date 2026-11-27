/**
 * Build and pack the `@copera.ai/code` npm package.
 *
 * Steps: a complete build with the `copera` client build profile; `pnpm deploy` of the launcher package (whose
 * closure holds the dsh CLI) into a stage; pruning of the stage to the `copera` profile's packages
 * (`./stage.ts`); an outer `package.json` generated from `npm-package.template.json` that bundles every staged
 * package; `npm pack`. The package is not a workspace member: upstream gates reject a workspace package with its
 * own bin or a name outside `@deepseek-ai/dsh-*`.
 *
 * Usage: `pnpm exec tsx scripts/copera/pack-npm.ts [--out dist/copera-npm] [--stage <dir>] [--client-profile copera]
 * [--skip-build]`. It never publishes.
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, globSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readClientBuildRecord } from '../client-build-environment.ts'
import { capture, isEntry, pnpmCommand, runConcurrent } from '../release/process.ts'
import { applyStagePlan, completeStage, excludedBundles, indexPackages, isExcludedPackage, LAUNCH_PACKAGE, replaceFile } from './stage.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const TEMPLATE = join(import.meta.dirname, 'npm-package.template.json')
const BIN_SHIM = join(import.meta.dirname, 'bin-shim.mjs')
const DEFAULT_OUT = 'dist/copera-npm'
const DEFAULT_CLIENT_PROFILE = 'copera'

/** Files of the deployed launcher package copied into the stage's `node_modules`. */
const LAUNCH_FILES = ['package.json', 'lib', 'src', 'README.md', 'README.zh.md']

/** Installation metadata the stage does not ship. */
const STAGE_RESIDUE = ['.bin', '.pnpm', '.modules.yaml', '.package-lock.json']

/** README of the published package. */
const PACKAGE_README = `# Copera Code

Copera Code is the Copera coding agent. It runs on your computer and opens a web interface in your browser.

## Install and run

\`\`\`sh
npm install -g @copera.ai/code
copera-code
\`\`\`

\`copera-code --help\` lists the options: \`--port\`, \`--host\`, and \`--no-open\`. Without \`--port\`, Copera Code listens on port 3080, or on a free port when 3080 is busy.

## Environment

| Variable | Meaning |
|---|---|
| \`COPERA_CODE_HOME\` | Data directory; default \`~/.copera-code\` |
| \`COPERA_CODE_TOKEN\` | Copera access token used instead of the stored sign-in |
| \`COPERA_CODE_API_ORIGIN\` | Copera API origin, https only; default \`https://api.copera.ai\` |

Requires Node.js NODE_RANGE.
`

/** Parsed command line. */
interface PackOptions {
  out: string
  stage: string
  clientProfile: string
  skipBuild: boolean
}

/**
 * Parse the command line.
 * @param args - Arguments after the script.
 * @returns The options.
 */
export function parsePackArguments(args: readonly string[]): PackOptions {
  const { values } = parseArgs({
    args: [...args],
    options: {
      out: { type: 'string' },
      stage: { type: 'string' },
      'client-profile': { type: 'string' },
      'skip-build': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })
  return {
    out: resolve(ROOT, values.out ?? DEFAULT_OUT),
    stage: resolve(values.stage ?? join(tmpdir(), `copera-code-stage-${String(process.pid)}`)),
    clientProfile: values['client-profile'] ?? DEFAULT_CLIENT_PROFILE,
    skipBuild: values['skip-build'],
  }
}

/** Run pnpm with the workspace's own pnpm entry. */
async function pnpm(args: readonly string[]): Promise<void> {
  const [command, ...prefix] = pnpmCommand()
  await runConcurrent(command, [...prefix, ...args], { cwd: ROOT })
}

/**
 * Build every artifact with a client build profile and prove the build record matches it.
 * @param profile - Client build profile name.
 * @param skipBuild - Reuse the current artifacts instead of building.
 */
async function buildArtifacts(profile: string, skipBuild: boolean): Promise<void> {
  if (!skipBuild) await pnpm(['exec', 'tsx', 'scripts/build.ts', '--profile', profile])
  const record = readClientBuildRecord(ROOT)
  if (record.environment.DSH_CLIENT_BUILD_PROFILE !== profile) {
    throw new Error(`pack-npm: the client artifacts were built with profile ${JSON.stringify(record.environment.DSH_CLIENT_BUILD_PROFILE)}, not ${JSON.stringify(profile)}`)
  }
  console.log(`pack-npm: client artifacts use the ${profile} build profile, title ${JSON.stringify(record.environment.DSH_CLIENT_TITLE)}`)
}

/**
 * Deploy the launcher's production closure and assemble the stage's `node_modules`.
 * @param stage - Empty stage directory.
 * @returns The package directory inside the stage.
 */
export async function deployStage(stage: string): Promise<string> {
  const deploy = join(stage, 'deploy')
  const packageDir = join(stage, 'package')
  await pnpm([
    '--filter', LAUNCH_PACKAGE, 'deploy', '--prod',
    // The same deploy settings as the Python runtime closure (scripts/build-exe-for-python-sdk.ts).
    '--config.allow-unused-patches=true',
    '--config.node-linker=hoisted',
    `--config.pnpmfile=${join(ROOT, 'scripts/python-runtime-deploy.pnpmfile.mjs')}`,
    '--config.link-workspace-packages=true',
    '--config.hoist-workspace-packages=false',
    deploy,
  ])
  mkdirSync(packageDir, { recursive: true })
  // A copy, not a rename: pnpm hard-links deployed files from its store, and npm pack never finishes on a tree
  // whose files share inodes (it stalls after the first few hard-link entries).
  cpSync(join(deploy, 'node_modules'), join(packageDir, 'node_modules'), { recursive: true })
  const launchDir = join(packageDir, 'node_modules', ...LAUNCH_PACKAGE.split('/'))
  if (existsSync(launchDir)) throw new Error(`pack-npm: ${LAUNCH_PACKAGE} is unexpectedly installed below its own deploy`)
  mkdirSync(launchDir, { recursive: true })
  for (const file of LAUNCH_FILES) {
    if (existsSync(join(deploy, file))) cpSync(join(deploy, file), join(launchDir, file), { recursive: true })
  }
  for (const residue of globSync(STAGE_RESIDUE.map(name => `node_modules/**/${name}`), { cwd: packageDir })) {
    rmSync(join(packageDir, residue), { recursive: true, force: true })
  }
  const links = globSync('node_modules/**', { cwd: packageDir, withFileTypes: true }).filter(entry => entry.isSymbolicLink())
  if (links.length > 0) throw new Error(`pack-npm: the deploy left symbolic links: ${links.slice(0, 5).map(entry => join(entry.parentPath, entry.name)).join(', ')}`)
  rmSync(deploy, { recursive: true, force: true })
  return packageDir
}

/** Workspace package directories by name, from the workspace globs of pnpm-workspace.yaml. */
function workspacePackages(): Map<string, string> {
  const packages = new Map<string, string>()
  for (const manifest of globSync(['vendor/*/package.json', 'packages/*/*/package.json', 'native/system/package.json', 'native/system/packages/*/package.json', 'apps/*/package.json'], { cwd: ROOT })) {
    const { name } = JSON.parse(readFileSync(join(ROOT, manifest), 'utf8')) as { name?: string }
    if (name !== undefined) packages.set(name, join(ROOT, manifest, '..'))
  }
  return packages
}

/**
 * Pack workspace packages the deploy left out and unpack them for the stage.
 * @param names - Missing package names; names outside the workspace are not supplied.
 * @param scratch - Directory for tarballs and unpacked packages.
 * @returns Unpacked package directories by name.
 */
export async function supplyWorkspacePackages(names: readonly string[], scratch: string): Promise<Map<string, string>> {
  const workspace = workspacePackages()
  const supplied = new Map<string, string>()
  const local = names.filter(name => workspace.has(name))
  if (local.length === 0) return supplied
  const batch = join(scratch, String(Date.now()))
  mkdirSync(batch, { recursive: true })
  await pnpm(['pack', '--recursive', ...local.map(name => `--filter=${name}`), '--pack-destination', batch])
  for (const tarball of readdirSync(batch).filter(file => file.endsWith('.tgz'))) {
    const unpacked = join(batch, tarball.slice(0, -'.tgz'.length))
    mkdirSync(unpacked)
    capture('tar', ['-xzf', join(batch, tarball), '-C', unpacked])
    const dir = join(unpacked, 'package')
    const { name } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string }
    supplied.set(name, dir)
  }
  console.log(`pack-npm: added workspace packages the deploy left out: ${[...supplied.keys()].sort().join(', ')}`)
  return supplied
}

/**
 * List staged packages the product must not contain.
 * @param packageDir - Stage package directory.
 * @returns Offending package directories relative to the stage, sorted.
 */
export function excludedStagedPackages(packageDir: string): string[] {
  const bundles = new Set(excludedBundles())
  return [...indexPackages(join(packageDir, 'node_modules')).values()]
    .filter(pkg => isExcludedPackage(pkg.manifest.name ?? '', bundles))
    .map(pkg => pkg.dir.slice(packageDir.length + 1))
    .sort()
}

/**
 * Write the outer manifest, bin, and documents of the package.
 * @param packageDir - Stage package directory.
 * @param bundled - Bundled dependency names and versions.
 * @param optionalDependencies - Platform and other optional registry dependencies.
 * @returns The outer manifest.
 */
function writeOuterPackage(
  packageDir: string, bundled: Record<string, string>, optionalDependencies: Record<string, string>,
): Record<string, unknown> {
  const template = JSON.parse(readFileSync(TEMPLATE, 'utf8')) as Record<string, unknown>
  const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { engines?: Record<string, string> }
  const node = root.engines?.node
  if (node === undefined) throw new Error('pack-npm: the root package.json declares no engines.node')
  const manifest = {
    ...template,
    engines: { node },
    dependencies: bundled,
    optionalDependencies,
    bundleDependencies: Object.keys(bundled),
  }
  writeFileSync(join(packageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  mkdirSync(join(packageDir, 'bin'), { recursive: true })
  const bin = join(packageDir, 'bin', 'copera-code.mjs')
  cpSync(BIN_SHIM, bin)
  chmodSync(bin, 0o755)
  cpSync(join(ROOT, 'LICENSE'), join(packageDir, 'LICENSE'))
  cpSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), join(packageDir, 'THIRD_PARTY_NOTICES.md'))
  replaceFile(join(packageDir, 'README.md'), PACKAGE_README.replace('NODE_RANGE', `\`${node}\``))
  return manifest
}

/** Pack the stage into `--out` and report the tarball. */
async function main(): Promise<void> {
  const options = parsePackArguments(process.argv.slice(2))
  await buildArtifacts(options.clientProfile, options.skipBuild)
  rmSync(options.stage, { recursive: true, force: true })
  mkdirSync(options.stage, { recursive: true })
  const packageDir = await deployStage(options.stage)
  await completeStage(packageDir, [LAUNCH_PACKAGE], async names => await supplyWorkspacePackages(names, join(options.stage, 'workspace-packs')))
  const summary = applyStagePlan(packageDir, [LAUNCH_PACKAGE])
  console.log(`pack-npm: kept ${String(summary.kept)} package directories, removed ${String(summary.removed)}`)
  for (const edge of summary.droppedEdges) console.log(`pack-npm: dropped edge ${edge}`)
  const excluded = excludedStagedPackages(packageDir)
  if (excluded.length > 0) throw new Error(`pack-npm: the stage contains excluded packages:\n  ${excluded.join('\n  ')}`)
  console.log('pack-npm: exclusion check passed (no Anthropic, Codex, Claude Code or Codex bridge, chat import, optional, on-demand, or other-profile bundle)')
  const manifest = writeOuterPackage(packageDir, summary.bundled, summary.optionalDependencies)
  console.log(`pack-npm: ${String(Object.keys(summary.bundled).length)} bundled and ${String(Object.keys(summary.optionalDependencies).length)} optional dependencies`)
  mkdirSync(options.out, { recursive: true })
  // The JSON report lists every packed file, which exceeds spawnSync's default output buffer.
  const npmPack = spawnSync('npm', ['pack', '--json', '--pack-destination', options.out], { cwd: packageDir, encoding: 'utf8', maxBuffer: 1 << 30 })
  if (npmPack.error !== undefined) throw npmPack.error
  if (npmPack.status !== 0) throw new Error(`pack-npm: npm pack exited with ${String(npmPack.status)}:\n${npmPack.stderr}`)
  const [packed] = JSON.parse(npmPack.stdout) as { filename: string; size: number; unpackedSize: number; entryCount: number }[]
  if (packed === undefined) throw new Error('pack-npm: npm pack reported no tarball')
  const tarball = join(options.out, packed.filename)
  console.log(`pack-npm: ${String(manifest.name)}@${String(manifest.version)} -> ${tarball}`)
  console.log(`pack-npm: ${String(statSync(tarball).size)} bytes, ${String(packed.entryCount)} files, ${String(packed.unpackedSize)} bytes unpacked`)
  console.log(`pack-npm: top level: ${readdirSync(packageDir).sort().join(', ')}`)
  console.log(`pack-npm: stage kept at ${options.stage}`)
}

if (isEntry(import.meta.url)) await main()
