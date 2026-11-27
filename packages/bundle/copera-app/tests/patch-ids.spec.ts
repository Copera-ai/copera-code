/**
 * The Copera Code product layer: every row id its patch names exists in the layers below it, the composed
 * `copera` profile mounts no enabled row that reaches a DeepSeek endpoint or installs bundles from the model, and
 * the restated agent presets equal the shipped `dsh-web-app` presets except for the Copera changes.
 */

import { globSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundlePatchPaths, composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { LOCKED_ROW_IDS } from '../src/product-lock.ts'

/** One Loader row as the composition returns it; `!!js` values are `{ __jsExpr }` objects. */
interface Row {
  id?: string
  name?: string
  group?: boolean
  disabled?: unknown
  config?: unknown
  insert?: Row[]
}

interface PresetConfig {
  id: string
  plugins: Row[]
}

const COPERA_APP = '@deepseek-ai/dsh-copera-app'
const repositoryRoot = resolve(import.meta.dirname, '../../../..')

const bundleDirs = new Map(globSync('packages/*/*/package.json', { cwd: repositoryRoot }).map((path) => {
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8')) as { name: string }
  return [manifest.name, dirname(resolve(repositoryRoot, path))]
}))

type PatchList = ReturnType<typeof loadOverlayPatches>

/** The ordered patch list of one workspace bundle, read through its `dsh.bundle.patch` declaration. */
function bundlePatches(name: string): PatchList {
  const dir = bundleDirs.get(name)
  if (dir === undefined) throw new Error(`${name} is not a workspace package`)
  const manifest = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as {
    dsh?: { bundle?: { patch: string | string[] } }
  }
  if (manifest.dsh?.bundle === undefined) throw new Error(`${name} declares no dsh.bundle.patch`)
  return bundlePatchPaths(dir, manifest.dsh.bundle).flatMap(path => loadOverlayPatches('test', path))
}

/** One patch file of a workspace bundle. */
function patchFile(name: string, file: string): Row[] {
  const dir = bundleDirs.get(name)
  if (dir === undefined) throw new Error(`${name} is not a workspace package`)
  return loadOverlayPatches('test', resolve(dir, file)) as Row[]
}

function compose(bundles: readonly string[], warnings: string[] = []): Row[] {
  return composeEntries(bundles.map(bundlePatches), warning => warnings.push(warning)) as Row[]
}

/** Children a row mounts: a group's entry list or an agent preset declaration's plugin list. */
function children(row: Row): Row[] {
  if (row.group === true && Array.isArray(row.config)) return row.config as Row[]
  if (row.name === '@deepseek-ai/dsh-agent-preset') return (row.config as PresetConfig).plugins
  return []
}

/** Every row reachable from `rows`, nested group and preset children included. */
function allRows(rows: Row[]): Row[] {
  return rows.flatMap(row => [row, ...allRows(children(row))])
}

/** Rows that can mount: a literal `disabled: true` row and everything under it cannot; a `!!js` condition can. */
function enabledRows(rows: Row[]): Row[] {
  return rows.filter(row => row.disabled !== true).flatMap(row => [row, ...enabledRows(children(row))])
}

/** Rows that mount for one profile name and platform, with every `!!js` `disabled` condition evaluated. */
function mountedRowsFor(rows: Row[], profileName: string, platform: NodeJS.Platform): Row[] {
  const ctx = { get: (name: string) => name === 'profileContext' ? { name: profileName } : undefined }
  const isDisabled = (row: Row): boolean => {
    const { disabled } = row
    if (disabled === undefined || typeof disabled === 'boolean') return disabled === true
    const source = (disabled as { __jsExpr: string }).__jsExpr
    // Evaluates the bundle's own `!!js` condition with the Desktop profile context, as the Loader does.
    // oxlint-disable-next-line typescript/no-implied-eval -- the condition source is the bundle's own patch file.
    const condition = new Function('ctx', 'process', `return (${source})`) as (context: typeof ctx, proc: object) => unknown
    return Boolean(condition(ctx, { platform, env: {} }))
  }
  return rows.filter(row => !isDisabled(row)).flatMap(row => [row, ...mountedRowsFor(children(row), profileName, platform)])
}

/** Every string inside a config value, including the source of `!!js` expressions. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

const DEEPSEEK_ENDPOINT = /deepseek\.com|deepseeksvc\.com/i
const UPSTREAM_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] as const

/** Packages whose source defaults or behavior call a DeepSeek-operated endpoint. */
const DEEPSEEK_ENDPOINT_PACKAGES = [
  '@deepseek-ai/dsh-deepseek-account', '@deepseek-ai/dsh-deepseek-auth', '@deepseek-ai/dsh-llm-deepseek',
  '@deepseek-ai/dsh-llm-deepseek-api-key', '@deepseek-ai/dsh-llm-deepseek-account', '@deepseek-ai/dsh-llm-pi-ai',
  '@deepseek-ai/dsh-web-search-deepseek', '@deepseek-ai/dsh-web-deepseek-api',
  '@deepseek-ai/dsh-deepseek-llm-api-extensions', '@deepseek-ai/dsh-session-log-deepseek',
  '@deepseek-ai/dsh-plugin-package-inventory-deepseek', '@deepseek-ai/dsh-host-product-telemetry-otel',
  '@deepseek-ai/dsh-session-telemetry-otel', '@deepseek-ai/dsh-client-ui-settings-models',
  '@deepseek-ai/dsh-client-ui-settings-web-search', '@deepseek-ai/dsh-deepseek-chat-import',
]

const PERSONA = 'You are Copera Code, a coding agent by Copera.'
/** The model-facing `plugin_manager` tool, which installs bundles into the profile. */
const PLUGIN_MANAGER_TOOLS = '@deepseek-ai/dsh-plugin-manager/tools'
const SUMMARY_ROUTE = { summarizationProvider: 'copera', summarizationModel: 'shikai-ultra-fast' }
/** Path suffix of the `dsh-doc` skill directory the shipped presets add to `skill-filesystem`. */
const DSH_DOC_SKILLS = "'@deepseek-ai/dsh-agent-preset/package.json')), 'skills')"

/** Enabled rows as `id → package`, in composition order, for the reviewed snapshots under tests/expected/. */
function rowSnapshot(rows: Row[]): string {
  return `${JSON.stringify(rows.map(row => `${row.id ?? '(anonymous)'} ${row.name ?? '(no name)'}`), null, 2)}\n`
}

describe('dsh-copera-app bundle', () => {
  it('is the last layer of the shipped copera profile', () => {
    expect(PROFILE_TEMPLATES.copera).toEqual({ bundles: [...UPSTREAM_BUNDLES, COPERA_APP] })
  })

  it('names only row ids that the base and web layers or its own inserts declare', () => {
    const upstreamIds = new Set(allRows(compose(UPSTREAM_BUNDLES)).flatMap(row => row.id ?? []))
    const own = bundlePatches(COPERA_APP) as Row[]
    const insertedIds = new Set(allRows(own.flatMap(patch => patch.insert ?? [])).flatMap(row => row.id ?? []))
    const targeted = own.filter(patch => patch.insert === undefined).map(patch => patch.id)
    expect(targeted.length).toBeGreaterThan(0)
    for (const id of targeted) {
      expect(typeof id).toBe('string')
      expect(upstreamIds.has(id!) || insertedIds.has(id!), `unknown row id ${String(id)}`).toBe(true)
    }
    const warnings: string[] = []
    compose(PROFILE_TEMPLATES.copera!.bundles, warnings)
    expect(warnings).toEqual([])
  })

  it('leaves no enabled row of the composed copera profile pointing at a DeepSeek endpoint', () => {
    const enabled = enabledRows(compose(PROFILE_TEMPLATES.copera!.bundles))
    const offenders = enabled.filter(row => strings(row.config).some(value => DEEPSEEK_ENDPOINT.test(value)))
    expect(offenders.map(row => row.id)).toEqual([])
    const endpointPackages = enabled.filter(row => DEEPSEEK_ENDPOINT_PACKAGES.includes(row.name ?? ''))
    expect(endpointPackages.map(row => row.id)).toEqual([])
  })

  // Copera Code Desktop composes the same template under the profile name `desktop`
  // (apps/desktop/tests/project-manager.spec.ts), which enables the Desktop-only rows.
  it.each(['darwin', 'win32'] as const)('mounts no DeepSeek endpoint row in the Desktop composition on %s', (platform) => {
    const mounted = mountedRowsFor(compose(PROFILE_TEMPLATES.copera!.bundles), 'desktop', platform)
    expect(mounted.filter(row => strings(row.config).some(value => DEEPSEEK_ENDPOINT.test(value))).map(row => row.id)).toEqual([])
    expect(mounted.filter(row => DEEPSEEK_ENDPOINT_PACKAGES.includes(row.name ?? '')).map(row => row.id)).toEqual([])
    expect(mounted.map(row => row.id)).toEqual(expect.arrayContaining(['copera-account', 'llm-copera', 'ui-brand-copera', 'ui-copera-account']))
  })

  it('mounts no enabled plugin_manager model tool, at host level or inside any preset', () => {
    const enabled = enabledRows(compose(PROFILE_TEMPLATES.copera!.bundles))
    expect(enabled.filter(row => row.name === PLUGIN_MANAGER_TOOLS).map(row => row.id)).toEqual([])
  })

  it('disables exactly the locked rows the product-lock guard checks', () => {
    const own = bundlePatches(COPERA_APP) as Row[]
    const disabled = own.filter(patch => patch.insert === undefined && patch.disabled === true).map(patch => patch.id)
    expect([...disabled].sort()).toEqual([...LOCKED_ROW_IDS].sort())
  })

  it('mounts the product-lock guard and makes the required Web server depend on it', () => {
    const rows = compose(PROFILE_TEMPLATES.copera!.bundles)
    const guard = rows.find(row => row.id === 'copera-product-lock')
    expect(guard).toMatchObject({ name: COPERA_APP })
    expect(guard?.disabled).toBeUndefined()
    expect((rows.find(row => row.id === 'webserver') as Row & { inject?: unknown }).inject)
      .toEqual(['webStartup', 'coperaProductLock'])
  })

  // An upstream merge that adds, removes, or renames an enabled row or a preset changes these files; review the
  // difference and update them with `pnpm exec vitest run packages/bundle/copera-app -u`, as the Copera upstream sync guide describes.
  it('keeps the reviewed set of enabled rows of the copera composition', async () => {
    await expect(rowSnapshot(enabledRows(compose(PROFILE_TEMPLATES.copera!.bundles))))
      .toMatchFileSnapshot('./expected/enabled-rows-copera.json')
  })

  it.each(['darwin', 'win32'] as const)('keeps the reviewed set of enabled rows of the Desktop composition on %s', async (platform) => {
    await expect(rowSnapshot(mountedRowsFor(compose(PROFILE_TEMPLATES.copera!.bundles), 'desktop', platform)))
      .toMatchFileSnapshot(`./expected/enabled-rows-desktop-${platform}.json`)
  })

  it('keeps the reviewed set of agent presets', async () => {
    const presets = allRows(compose(PROFILE_TEMPLATES.copera!.bundles))
      .filter(row => row.name === '@deepseek-ai/dsh-agent-preset')
      .map(row => `${row.id ?? ''} ${(row.config as PresetConfig).id}${row.disabled === true ? ' (disabled)' : ''}`)
    await expect(`${JSON.stringify(presets, null, 2)}\n`).toMatchFileSnapshot('./expected/presets.json')
  })

  it('switches off every locked row', () => {
    const rows = allRows(compose(PROFILE_TEMPLATES.copera!.bundles))
    for (const id of LOCKED_ROW_IDS) {
      const matches = rows.filter(row => row.id === id)
      expect(matches.length, `row ${id}`).toBeGreaterThan(0)
      for (const row of matches) expect(row.disabled, `row ${id}`).toBe(true)
    }
  })

  it('routes the default model, session titles, persona, theme, startup label, and languages to Copera values', () => {
    const rows = compose(PROFILE_TEMPLATES.copera!.bundles)
    const config = (id: string): unknown => rows.find(row => row.id === id)?.config
    expect(config('agent-default-model')).toEqual({ provider: 'copera', model: 'shikai' })
    expect(config('system-prompt')).toEqual({ includeHarnessIdentity: false, personaPrefix: PERSONA })
    expect(config('session-title-llm')).toEqual({
      targetWords: 5, targetCjkCharacters: 10, maxInputBytes: 4096, maxOutputTokens: 4096, timeoutMs: 60000,
      provider: 'copera', model: 'shikai-ultra-fast',
    })
    expect(config('ui-theme')).toEqual({ preference: 'dark' })
    const userAgent = (config('web-fetch-http') as { userAgent: { __jsExpr: string } }).userAgent.__jsExpr
    // oxlint-disable-next-line typescript/no-implied-eval -- evaluates the bundle's own `!!js` expression as the Loader does.
    const render = new Function('process', `return (${userAgent})`) as (proc: object) => string
    expect(render({ env: { DSH_COPERA_PRODUCT_VERSION: '0.1.0' } })).toBe('copera-code/0.1.0 (+https://github.com/Copera-ai/copera-code)')
    expect(render({ env: {} })).toBe('copera-code/unknown (+https://github.com/Copera-ai/copera-code)')
    expect(config('authentication-token')).toEqual({ cookieMaxAgeDays: 30, entryLabel: 'Copera Code' })
    expect(config('locale')).toEqual({ languages: ['en', 'pt'], labels: { pt: 'Português (Brasil)' } })
  })

  // Loader patches replace a preset row's whole config, so the bundle restates each shipped preset. This
  // comparison fails whenever dsh-web-app changes a preset, which forces the restatement to be refreshed. The
  // allowed differences are exactly: the persona prefix, `search: false` on tool-web, the compaction summary
  // route, no `dsh-doc` skill directory on skill-filesystem, and no `tool-plugin-manager` row.
  it.each(['standard', 'ptc', 'minimal'])('restates the shipped %s preset with only the Copera changes', (id) => {
    const upstream = patchFile('@deepseek-ai/dsh-web-app', `presets/${id}.patch.yml`)
      .flatMap(patch => patch.insert ?? []).find(row => row.id === `preset-${id}`)
    expect(upstream).toBeDefined()
    const expected = structuredClone(upstream!.config) as PresetConfig
    expected.plugins = expected.plugins.filter(row => row.name !== PLUGIN_MANAGER_TOOLS)
    for (const row of allRows(expected.plugins)) {
      const config = (row.config ?? {}) as Record<string, unknown>
      if (row.id === 'persona') row.config = { ...config, prefix: PERSONA }
      if (row.id === 'tool-web') row.config = { ...config, search: false }
      if (row.id === 'compaction-basic') row.config = { ...config, ...SUMMARY_ROUTE }
      const skillDirs = config.customSkillDirs
      if (row.id === 'skill-filesystem' && Array.isArray(skillDirs)) {
        const dirs = skillDirs.filter((dir: unknown) => !strings(dir).some(value => value.endsWith(DSH_DOC_SKILLS)))
        const { customSkillDirs: _dropped, ...rest } = config
        const next = dirs.length === 0 ? rest : { ...rest, customSkillDirs: dirs }
        if (Object.keys(next).length === 0) delete row.config
        else row.config = next
      }
    }
    const composed = compose(PROFILE_TEMPLATES.copera!.bundles).find(row => row.id === `preset-${id}`)
    expect(composed?.name).toBe('@deepseek-ai/dsh-agent-preset')
    expect(composed?.disabled).toBeUndefined()
    expect(composed?.config).toEqual(expected)
    const plugins = allRows((composed!.config as PresetConfig).plugins)
    expect(plugins.find(row => row.id === 'persona')?.config).toMatchObject({ prefix: PERSONA })
    expect(plugins.find(row => row.id === 'compaction-basic')?.config).toEqual(SUMMARY_ROUTE)
    const toolWeb = plugins.find(row => row.id === 'tool-web')
    if (toolWeb !== undefined) expect(toolWeb.config).toMatchObject({ search: false })
    expect(plugins.filter(row => row.name === PLUGIN_MANAGER_TOOLS)).toEqual([])
    expect(strings(composed?.config).filter(value => value.endsWith(DSH_DOC_SKILLS))).toEqual([])
  })
})
