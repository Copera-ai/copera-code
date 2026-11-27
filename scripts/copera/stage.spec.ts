import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyStagePlan,
  completeStage,
  excludedBundles,
  indexPackages,
  isForbiddenPackage,
  LAUNCH_PACKAGE,
  planStage,
  type StageManifest,
} from './stage.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Create a stage whose `node_modules` holds the given packages, keyed by path below `node_modules`. */
function stage(packages: Record<string, StageManifest>): string {
  const root = mkdtempSync(join(tmpdir(), 'copera-stage-spec-'))
  roots.push(root)
  for (const [path, manifest] of Object.entries(packages)) writePackage(join(root, 'node_modules', path), manifest)
  return root
}

/** Write one package manifest. */
function writePackage(dir: string, manifest: StageManifest): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0', ...manifest }))
}

/** Read a staged manifest. */
function manifest(root: string, path: string): StageManifest {
  return JSON.parse(readFileSync(join(root, 'node_modules', path, 'package.json'), 'utf8')) as StageManifest
}

const launch = { name: LAUNCH_PACKAGE, dependencies: { '@deepseek-ai/dsh': 'file:../cli' } }

describe('excluded packages', () => {
  it('names the forbidden SDKs and bridges', () => {
    expect(isForbiddenPackage('@anthropic-ai/sdk')).toBe(true)
    expect(isForbiddenPackage('@openai/codex')).toBe(true)
    expect(isForbiddenPackage('@deepseek-ai/dsh-subagent-claude-code')).toBe(true)
    expect(isForbiddenPackage('@deepseek-ai/dsh-subagent-codex')).toBe(true)
    expect(isForbiddenPackage('@deepseek-ai/dsh-deepseek-chat-import')).toBe(true)
    expect(isForbiddenPackage('openai')).toBe(false)
    expect(isForbiddenPackage('@deepseek-ai/dsh-llm-copera')).toBe(false)
  })

  it('excludes optional, on-demand, and other-profile bundles but not the copera bundles', () => {
    const bundles = excludedBundles()
    expect(bundles).toEqual(expect.arrayContaining([
      '@deepseek-ai/dsh-acp-app', '@deepseek-ai/dsh-headless', '@deepseek-ai/dsh-sdk-app', '@deepseek-ai/dsh-sdk-minimal',
      '@deepseek-ai/dsh-timeline', '@deepseek-ai/dsh-subagent-codex',
    ]))
    for (const kept of ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-copera-app']) {
      expect(bundles).not.toContain(kept)
    }
  })
})

describe('applyStagePlan', () => {
  it('keeps the launcher closure, drops the CLI edges to excluded bundles, and pins workspace specs', () => {
    const root = stage({
      [LAUNCH_PACKAGE]: launch,
      '@deepseek-ai/dsh': {
        name: '@deepseek-ai/dsh',
        version: '0.2.3',
        dependencies: { '@deepseek-ai/dsh-base': 'workspace:*', '@deepseek-ai/dsh-acp-app': 'workspace:*', commander: '^15.0.0' },
        devDependencies: { '@deepseek-ai/dsh-llm-mock-server': 'workspace:*' },
      },
      '@deepseek-ai/dsh-base': {
        name: '@deepseek-ai/dsh-base',
        version: '0.2.3',
        dependencies: { '@deepseek-ai/dsh-error': 'workspace:*' },
        peerDependencies: { '@deepseek-ai/cordis': 'workspace:~', 'bufferutil': '^4' },
        peerDependenciesMeta: { bufferutil: { optional: true } },
      },
      '@deepseek-ai/dsh-error': { name: '@deepseek-ai/dsh-error', version: '0.2.3' },
      '@deepseek-ai/cordis': { name: '@deepseek-ai/cordis', version: '0.5.0' },
      '@deepseek-ai/dsh-acp-app': { name: '@deepseek-ai/dsh-acp-app', version: '0.2.3' },
      commander: { name: 'commander', version: '15.0.0' },
      unused: { name: 'unused' },
    })
    const summary = applyStagePlan(root, [LAUNCH_PACKAGE])
    expect(Object.keys(summary.bundled)).toEqual([
      '@deepseek-ai/cordis', '@deepseek-ai/dsh', '@deepseek-ai/dsh-base', LAUNCH_PACKAGE, '@deepseek-ai/dsh-error', 'commander',
    ].sort((left, right) => left.localeCompare(right)))
    expect(summary.droppedEdges).toEqual(['@deepseek-ai/dsh -> @deepseek-ai/dsh-acp-app'])
    expect(summary.optionalDependencies).toEqual({})
    expect(existsSync(join(root, 'node_modules', 'unused'))).toBe(false)
    expect(existsSync(join(root, 'node_modules', '@deepseek-ai', 'dsh-acp-app'))).toBe(false)
    expect(manifest(root, '@deepseek-ai/dsh').dependencies).toEqual({ '@deepseek-ai/dsh-base': '0.2.3', commander: '^15.0.0' })
    expect(manifest(root, '@deepseek-ai/dsh').devDependencies).toBeUndefined()
    expect(manifest(root, '@deepseek-ai/dsh-base').peerDependencies).toEqual({ '@deepseek-ai/cordis': '~0.5.0', bufferutil: '^4' })
    expect(manifest(root, LAUNCH_PACKAGE).dependencies).toEqual({ '@deepseek-ai/dsh': '0.2.3' })
  })

  it('drops an allowlisted lazy edge and rejects any other edge to a forbidden package', () => {
    const lazy = stage({
      [LAUNCH_PACKAGE]: { name: LAUNCH_PACKAGE, dependencies: { '@earendil-works/pi-ai': '1.3.0' } },
      '@earendil-works/pi-ai': { name: '@earendil-works/pi-ai', dependencies: { '@anthropic-ai/sdk': '0.129.0' } },
      '@anthropic-ai/sdk': { name: '@anthropic-ai/sdk' },
    })
    expect(applyStagePlan(lazy, [LAUNCH_PACKAGE]).droppedEdges).toEqual(['@earendil-works/pi-ai -> @anthropic-ai/sdk'])
    expect(manifest(lazy, '@earendil-works/pi-ai').dependencies).toEqual({})
    expect(existsSync(join(lazy, 'node_modules', '@anthropic-ai'))).toBe(false)

    const direct = stage({
      [LAUNCH_PACKAGE]: { name: LAUNCH_PACKAGE, dependencies: { '@anthropic-ai/sdk': '0.129.0' } },
      '@anthropic-ai/sdk': { name: '@anthropic-ai/sdk' },
    })
    expect(() => applyStagePlan(direct, [LAUNCH_PACKAGE])).toThrow(/depends on excluded package @anthropic-ai\/sdk/)
  })

  it('moves platform packages to the outer optional dependencies', () => {
    const root = stage({
      [LAUNCH_PACKAGE]: { name: LAUNCH_PACKAGE, dependencies: { sharp: '0.35.5', ws: '8.0.0' } },
      sharp: { name: 'sharp', optionalDependencies: { '@img/sharp-linux-x64': '0.35.5', '@img/sharp-darwin-arm64': '0.35.5' } },
      '@img/sharp-linux-x64': { name: '@img/sharp-linux-x64', os: ['linux'], cpu: ['x64'] },
      ws: { name: 'ws', optionalDependencies: { 'skipped-on-purpose': '^1.0.0' } },
    })
    const summary = applyStagePlan(root, [LAUNCH_PACKAGE])
    expect(summary.optionalDependencies).toEqual({ '@img/sharp-darwin-arm64': '0.35.5', '@img/sharp-linux-x64': '0.35.5' })
    expect(summary.bundled).toEqual({ [LAUNCH_PACKAGE]: '1.0.0', sharp: '1.0.0', ws: '1.0.0' })
    expect(existsSync(join(root, 'node_modules', '@img'))).toBe(false)
  })

  it('resolves nested versions before hoisted ones', () => {
    const root = stage({
      [LAUNCH_PACKAGE]: { name: LAUNCH_PACKAGE, dependencies: { a: '1.0.0', dep: '2.0.0' } },
      a: { name: 'a', dependencies: { dep: '1.0.0' } },
      'a/node_modules/dep': { name: 'dep', version: '1.0.0' },
      dep: { name: 'dep', version: '2.0.0' },
    })
    const plan = planStage(indexPackages(join(root, 'node_modules')), root, [LAUNCH_PACKAGE], new Set())
    expect(plan.keep.has(join(root, 'node_modules', 'a', 'node_modules', 'dep'))).toBe(true)
    expect(plan.keep.has(join(root, 'node_modules', 'dep'))).toBe(true)
  })

  it('reports missing required dependencies and platform packages', () => {
    const root = stage({
      [LAUNCH_PACKAGE]: { name: LAUNCH_PACKAGE, dependencies: { gone: '1.0.0', native: '1.0.0' } },
      native: { name: 'native', os: ['linux'] },
    })
    const plan = planStage(indexPackages(join(root, 'node_modules')), root, [LAUNCH_PACKAGE], new Set())
    expect(plan.missing).toEqual(['gone'])
    expect(plan.failures).toEqual([
      `node_modules/${LAUNCH_PACKAGE} requires gone, which is not installed`,
      `node_modules/${LAUNCH_PACKAGE} requires the platform package native; only optional platform dependencies are portable`,
    ])
  })
})

describe('completeStage', () => {
  it('adds supplied packages until nothing more is missing', async () => {
    const root = stage({
      [LAUNCH_PACKAGE]: { name: LAUNCH_PACKAGE, peerDependencies: { '@deepseek-ai/dsh-error': '0.2.3' } },
    })
    const supplies: string[][] = []
    const added = await completeStage(root, [LAUNCH_PACKAGE], async (names) => {
      supplies.push([...names])
      const supplied = new Map<string, string>()
      if (names.includes('@deepseek-ai/dsh-error')) {
        const dir = join(root, 'supply', 'error')
        writePackage(dir, { name: '@deepseek-ai/dsh-error', peerDependencies: { '@deepseek-ai/dsh-scope': '0.2.3' } })
        supplied.set('@deepseek-ai/dsh-error', dir)
      }
      if (names.includes('@deepseek-ai/dsh-scope')) {
        const dir = join(root, 'supply', 'scope')
        writePackage(dir, { name: '@deepseek-ai/dsh-scope' })
        supplied.set('@deepseek-ai/dsh-scope', dir)
      }
      return await Promise.resolve(supplied)
    })
    expect(added).toEqual(['@deepseek-ai/dsh-error', '@deepseek-ai/dsh-scope'])
    expect(supplies).toEqual([['@deepseek-ai/dsh-error'], ['@deepseek-ai/dsh-scope']])
    expect(applyStagePlan(root, [LAUNCH_PACKAGE]).kept).toBe(3)
  })
})
