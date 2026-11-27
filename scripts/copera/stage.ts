/**
 * Prune a `pnpm deploy` tree to the packages the `copera` profile runs and rewrite its manifests for npm.
 *
 * The deployed CLI declares every bundle the upstream installation ships, including optional, on-demand, and
 * other-profile bundles. The stage keeps only the packages reachable from the Copera launcher without following
 * those excluded names, removes platform packages (they become optional dependencies of the outer package),
 * and turns pnpm `workspace:` and `file:` specs into the exact versions present in the stage.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { OPTIONAL_BUNDLES, ON_DEMAND_BUNDLES, PROFILE_TEMPLATES } from '../../packages/util/official-bundles/src/bundles.ts'

/** The package manifest fields the stage reads and rewrites. */
export interface StageManifest {
  name?: string
  version?: string
  os?: string[]
  cpu?: string[]
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

/** One installed package directory below the stage's `node_modules`. */
export interface StagedPackage {
  /** Absolute package directory. */
  dir: string
  /** Parsed `package.json`. */
  manifest: StageManifest
}

/** The CLI package; its manifest may name excluded bundles, which the stage drops. */
export const CLI_PACKAGE = '@deepseek-ai/dsh'

/** The launcher package the outer bin imports. */
export const LAUNCH_PACKAGE = '@deepseek-ai/dsh-copera-launch'

/** The shipped profile the product runs. */
export const PRODUCT_PROFILE = 'copera'

/**
 * Third-party edges to excluded packages that are never loaded on the Copera route; the stage drops them from
 * the declaring manifest so npm does not install them.
 */
export const LAZY_EXCLUDED_EDGES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '@earendil-works/pi-ai': {
    '@anthropic-ai/sdk': 'imported only by the anthropic-messages API module, which pi-ai loads lazily; llm-copera uses openai-completions',
  },
}

/**
 * Whether a package name is one the published package must never contain: Anthropic and Codex SDKs, the Claude
 * Code and Codex bridges, and the DeepSeek chat import.
 * @param name - npm package name.
 * @returns `true` for a forbidden name.
 */
export function isForbiddenPackage(name: string): boolean {
  return name.startsWith('@anthropic-ai/')
    || name === '@openai/codex' || name.startsWith('@openai/codex-')
    || (name.startsWith('@deepseek-ai/') && /claude-code|codex|deepseek-chat-import/.test(name))
}

/**
 * The bundle names the installation ships for other profiles or for opt-in use, minus the product profile's own.
 * @returns Sorted bundle package names the stage excludes.
 */
export function excludedBundles(): string[] {
  const product = new Set(PROFILE_TEMPLATES[PRODUCT_PROFILE]?.bundles ?? [])
  if (product.size === 0) throw new Error(`stage: the official bundles define no ${PRODUCT_PROFILE} profile`)
  const names = new Set([
    ...OPTIONAL_BUNDLES,
    ...ON_DEMAND_BUNDLES,
    ...Object.values(PROFILE_TEMPLATES).flatMap(template => template.bundles),
  ])
  return [...names].filter(name => !product.has(name)).sort()
}

/**
 * Whether the stage must not ship a package.
 * @param name - npm package name.
 * @param bundles - Excluded bundle names from {@link excludedBundles}.
 * @returns `true` when the package is forbidden or an excluded bundle.
 */
export function isExcludedPackage(name: string, bundles: ReadonlySet<string>): boolean {
  return isForbiddenPackage(name) || bundles.has(name)
}

/**
 * Index every package directory below a `node_modules` tree, including nested ones.
 * @param nodeModules - Absolute `node_modules` directory.
 * @returns Package directory to parsed manifest.
 */
export function indexPackages(nodeModules: string): Map<string, StagedPackage> {
  const index = new Map<string, StagedPackage>()
  const visit = (directory: string): void => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || !entry.isDirectory()) continue
      const path = join(directory, entry.name)
      if (entry.name.startsWith('@')) {
        visit(path)
        continue
      }
      const manifestPath = join(path, 'package.json')
      if (!existsSync(manifestPath)) continue
      index.set(path, { dir: path, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) as StageManifest })
      visit(join(path, 'node_modules'))
    }
  }
  visit(nodeModules)
  return index
}

/**
 * Resolve a package name the way Node does from a directory, without leaving the stage.
 * @param index - Indexed stage packages.
 * @param stageRoot - Absolute stage root; resolution stops there.
 * @param from - Directory of the importing package, or the stage root.
 * @param name - Package name.
 * @returns The resolved package directory, or `undefined`.
 */
export function resolveStaged(
  index: ReadonlyMap<string, StagedPackage>, stageRoot: string, from: string, name: string,
): string | undefined {
  for (let directory = from; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', ...name.split('/'))
    if (index.has(candidate)) return candidate
    if (directory === stageRoot || !directory.startsWith(stageRoot + sep)) return undefined
  }
}

/** One declared dependency edge. */
interface Edge {
  name: string
  spec: string
  optional: boolean
  /** Whether the edge is a peer dependency; npm never installs an optional peer. */
  peer: boolean
}

/** List the runtime edges of a manifest: dependencies, optional dependencies, and peer dependencies. */
function edges(manifest: StageManifest): Edge[] {
  const optional = manifest.optionalDependencies ?? {}
  const list: Edge[] = []
  for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
    if (!Object.hasOwn(optional, name)) list.push({ name, spec, optional: false, peer: false })
  }
  for (const [name, spec] of Object.entries(optional)) list.push({ name, spec, optional: true, peer: false })
  for (const [name, spec] of Object.entries(manifest.peerDependencies ?? {})) {
    list.push({ name, spec, optional: manifest.peerDependenciesMeta?.[name]?.optional === true, peer: true })
  }
  return list
}

/** Whether a manifest restricts its package to some operating systems or CPUs. */
function isPlatformPackage(manifest: StageManifest): boolean {
  return manifest.os !== undefined || manifest.cpu !== undefined
}

/** Whether a spec is a plain registry semver range or version. */
function isRegistrySpec(spec: string): boolean {
  return /^[\d^~<>=*| .\-+A-Za-z]*$/.test(spec) && !/[:/]/.test(spec) && spec.trim() !== ''
}

/** What {@link planStage} decided. */
export interface StagePlan {
  /** Package directories the stage keeps. */
  keep: Set<string>
  /** Platform packages and unresolved optional registry dependencies, for the outer `optionalDependencies`. */
  optionalDependencies: Record<string, string>
  /** Edges dropped from manifests: `from -> to`. */
  droppedEdges: string[]
  /** Names of required dependencies that are not installed, sorted. */
  missing: string[]
  /** Every reason the closure is not shippable, missing dependencies included, sorted. */
  failures: string[]
}

/**
 * Compute the packages the stage keeps.
 * @param index - Indexed stage packages.
 * @param stageRoot - Absolute stage root.
 * @param roots - Package names resolved from the stage root.
 * @param bundles - Excluded bundle names.
 * @returns The plan; `failures` lists every missing required dependency and every edge to an excluded package
 *   that the CLI or {@link LAZY_EXCLUDED_EDGES} does not account for.
 */
export function planStage(
  index: ReadonlyMap<string, StagedPackage>, stageRoot: string, roots: readonly string[], bundles: ReadonlySet<string>,
): StagePlan {
  const keep = new Set<string>()
  const optionalDependencies: Record<string, string> = {}
  const droppedEdges: string[] = []
  const failures: string[] = []
  const missing = new Set<string>()
  const optionalCandidates = new Map<string, (Edge & { platform: boolean })[]>()
  const queue: string[] = []
  const display = (dir: string): string => relative(stageRoot, dir).split(sep).join('/')
  for (const name of roots) {
    const dir = resolveStaged(index, stageRoot, stageRoot, name)
    if (dir === undefined) failures.push(`root ${name} is not installed`)
    else if (!keep.has(dir)) { keep.add(dir); queue.push(dir) }
  }
  for (let dir = queue.shift(); dir !== undefined; dir = queue.shift()) {
    const { manifest } = index.get(dir) as StagedPackage
    for (const edge of edges(manifest)) {
      if (isExcludedPackage(edge.name, bundles)) {
        if (manifest.name === CLI_PACKAGE || LAZY_EXCLUDED_EDGES[manifest.name ?? '']?.[edge.name] !== undefined) {
          droppedEdges.push(`${manifest.name ?? display(dir)} -> ${edge.name}`)
        } else failures.push(`${display(dir)} depends on excluded package ${edge.name}`)
        continue
      }
      const target = resolveStaged(index, stageRoot, dir, edge.name)
      const platform = target !== undefined && isPlatformPackage((index.get(target) as StagedPackage).manifest)
      if (target === undefined || platform) {
        if (edge.optional && !edge.peer && isRegistrySpec(edge.spec)) {
          const list = optionalCandidates.get(dir) ?? []
          list.push({ ...edge, platform })
          optionalCandidates.set(dir, list)
        } else if (!edge.optional) {
          if (target === undefined) missing.add(edge.name)
          failures.push(target === undefined
            ? `${display(dir)} requires ${edge.name}, which is not installed`
            : `${display(dir)} requires the platform package ${edge.name}; only optional platform dependencies are portable`)
        }
        continue
      }
      if (!keep.has(target)) { keep.add(target); queue.push(target) }
    }
  }
  // A package whose installed optional dependency is a platform package selects its binary per platform; its
  // optional dependencies missing here are the other platforms' packages. Other missing optional dependencies were
  // skipped by the deploy on purpose and stay absent.
  for (const candidates of optionalCandidates.values()) {
    if (!candidates.some(candidate => candidate.platform)) continue
    for (const { name, spec } of candidates) {
      const previous = optionalDependencies[name]
      if (previous !== undefined && previous !== spec) failures.push(`optional dependency ${name} is declared as both ${previous} and ${spec}`)
      optionalDependencies[name] = spec
    }
  }
  return {
    keep,
    optionalDependencies: sortRecord(optionalDependencies),
    droppedEdges: droppedEdges.sort(),
    missing: [...missing].sort(),
    failures: [...new Set(failures)].sort(),
  }
}

/**
 * Rewrite one kept manifest for npm: drop excluded and unresolvable edges, pin `workspace:` and `file:` specs to
 * the staged version, and remove development dependencies that name workspace packages.
 * @param index - Indexed stage packages.
 * @param stageRoot - Absolute stage root.
 * @param pkg - The kept package.
 * @param bundles - Excluded bundle names.
 * @returns The rewritten manifest.
 * @throws Error if a required local spec does not resolve to a staged package.
 */
export function rewriteManifest(
  index: ReadonlyMap<string, StagedPackage>, stageRoot: string, pkg: StagedPackage, bundles: ReadonlySet<string>,
): StageManifest {
  const manifest: StageManifest = structuredClone(pkg.manifest)
  if (Object.values(manifest.devDependencies ?? {}).some(isLocalSpec)) delete manifest.devDependencies
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
    const section = manifest[field]
    if (section === undefined) continue
    const rewritten: Record<string, string> = {}
    for (const [name, spec] of Object.entries(section)) {
      if (isExcludedPackage(name, bundles)) continue
      if (!isLocalSpec(spec)) {
        rewritten[name] = spec
        continue
      }
      const target = resolveStaged(index, stageRoot, pkg.dir, name)
      const version = target === undefined ? undefined : index.get(target)?.manifest.version
      if (version !== undefined) rewritten[name] = pinnedSpec(spec, version)
      else if (field === 'dependencies') throw new Error(`stage: ${manifest.name ?? pkg.dir} requires ${name} (${spec}), which is not staged`)
    }
    manifest[field] = rewritten
  }
  if (manifest.peerDependenciesMeta !== undefined) {
    manifest.peerDependenciesMeta = Object.fromEntries(Object.entries(manifest.peerDependenciesMeta)
      .filter(([name]) => !isExcludedPackage(name, bundles)))
  }
  return manifest
}

/** Whether a spec points into the workspace or the local filesystem. */
function isLocalSpec(spec: string): boolean {
  return spec.startsWith('workspace:') || spec.includes('file:') || spec.startsWith('link:')
}

/** Replace a pnpm local spec with the npm range pnpm publish would write. */
function pinnedSpec(spec: string, version: string): string {
  if (spec === 'workspace:~') return `~${version}`
  if (spec === 'workspace:^') return `^${version}`
  if (spec.startsWith('workspace:') && spec !== 'workspace:*') return spec.slice('workspace:'.length)
  return version
}

/** Return a copy of a record with sorted keys. */
function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)))
}

/**
 * Add the required packages a deploy leaves out until the closure resolves. `pnpm deploy` installs no peer
 * dependency that names a workspace package (Service Definition packages are peers of their implementations), so
 * the caller packs those packages from the workspace.
 * @param stageRoot - Absolute stage root holding `node_modules`.
 * @param roots - Package names resolved from the stage root.
 * @param supply - Produces an unpacked package directory for each name it can supply; others stay missing.
 * @returns The names added, sorted.
 */
export async function completeStage(
  stageRoot: string, roots: readonly string[], supply: (names: readonly string[]) => Promise<ReadonlyMap<string, string>>,
): Promise<string[]> {
  const bundles = new Set(excludedBundles())
  const added: string[] = []
  for (;;) {
    const plan = planStage(indexPackages(join(stageRoot, 'node_modules')), stageRoot, roots, bundles)
    const supplied = plan.missing.length === 0 ? new Map<string, string>() : await supply(plan.missing)
    if (supplied.size === 0) return added.sort()
    for (const [name, dir] of supplied) {
      const target = join(stageRoot, 'node_modules', ...name.split('/'))
      if (existsSync(target)) throw new Error(`stage: ${name} is supplied but already staged at ${target}`)
      mkdirSync(dirname(target), { recursive: true })
      renameSync(dir, target)
      added.push(name)
    }
  }
}

/** What {@link applyStagePlan} did to the stage. */
export interface StageSummary {
  /** Kept top-level package names, the outer package's bundled dependencies, with their versions. */
  bundled: Record<string, string>
  /** Outer optional dependencies. */
  optionalDependencies: Record<string, string>
  /** Number of package directories removed. */
  removed: number
  /** Number of package directories kept, nested ones included. */
  kept: number
  /** Edges dropped from manifests. */
  droppedEdges: string[]
}

/**
 * Prune the stage's `node_modules` to the closure of `roots` and rewrite every kept manifest.
 * @param stageRoot - Absolute stage root holding `node_modules`.
 * @param roots - Package names resolved from the stage root.
 * @returns What was kept, removed, and dropped.
 */
export function applyStagePlan(stageRoot: string, roots: readonly string[]): StageSummary {
  const nodeModules = join(stageRoot, 'node_modules')
  const bundles = new Set(excludedBundles())
  const index = indexPackages(nodeModules)
  const plan = planStage(index, stageRoot, roots, bundles)
  if (plan.failures.length > 0) {
    throw new Error(`stage: the ${PRODUCT_PROFILE} closure is not shippable:\n  ${plan.failures.join('\n  ')}`)
  }
  const removedDirs = [...index.keys()].filter(dir => !plan.keep.has(dir))
  // Rewrite before removing, so a pinned spec still finds the staged version.
  const rewritten = [...plan.keep].map(dir => [dir, rewriteManifest(index, stageRoot, index.get(dir) as StagedPackage, bundles)] as const)
  for (const dir of removedDirs.sort((left, right) => right.length - left.length)) rmSync(dir, { recursive: true, force: true })
  for (const [dir, manifest] of rewritten) replaceFile(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  removeEmptyScopes(nodeModules)
  const bundled: Record<string, string> = {}
  for (const dir of plan.keep) {
    if (dirname(dir) !== nodeModules && dirname(dirname(dir)) !== nodeModules) continue
    const { name, version } = (index.get(dir) as StagedPackage).manifest
    if (name === undefined || version === undefined) throw new Error(`stage: ${dir} has no name or version`)
    if (join(nodeModules, ...name.split('/')) === dir) bundled[name] = version
  }
  return {
    bundled: sortRecord(bundled),
    optionalDependencies: plan.optionalDependencies,
    removed: removedDirs.length,
    kept: plan.keep.size,
    droppedEdges: plan.droppedEdges,
  }
}

/**
 * Replace a file with new content without writing through it: deployed files can be hard links into the pnpm
 * content-addressable store, which an in-place write would corrupt.
 * @param path - File to replace.
 * @param content - New content.
 */
export function replaceFile(path: string, content: string): void {
  rmSync(path, { force: true })
  writeFileSync(path, content)
}

/** Remove scope directories left empty by pruning. */
function removeEmptyScopes(nodeModules: string): void {
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.name.startsWith('@') || !entry.isDirectory()) continue
    const path = join(nodeModules, entry.name)
    if (readdirSync(path).length === 0) rmSync(path, { recursive: true })
  }
}
