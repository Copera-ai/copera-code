/**
 * The Copera Code product lock over the real `copera` composition: the profile is composed by app-boot's
 * `readProfilePatches` exactly as `dsh --profile copera` composes it (bundles, the profile patch, the data-home patch),
 * and the `copera-product-lock` guard boots through the Cordis Loader and app-boot's startup audit. Every other row
 * is a no-op stand-in that keeps its id, `disabled`, and `inject`, so the guard reads the composed tree as it would at
 * startup without importing the product's plugins.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader, { type EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import {
  auditStartupEntries, composeEntries, initProfile, readProfilePatches, StartupError, type ProfileContext,
} from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import * as Guard from '../src/index.ts'
import { COPERA_APP_BUNDLE, LOCKED_ROW_IDS, productLockViolations, type ProductLockRow } from '../src/product-lock.ts'

interface Row {
  id?: string
  name?: string
  group?: boolean
  disabled?: unknown
  inject?: unknown
  config?: unknown
}

const repositoryRoot = resolve(import.meta.dirname, '../../../..')
const BUNDLES = PROFILE_TEMPLATES.copera!.bundles
const homes: string[] = []
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })

/**
 * A fresh data home with the shipped `copera` profile, an optional data-home patch, and its launcher facts.
 * @param homePatch - contents of `<home>/cordis.patch.yml`, or undefined for none.
 * @param bundles - the profile's bundle list.
 * @returns the profile context `dsh --profile copera` would provide.
 */
function profile(homePatch?: string, bundles: readonly string[] = BUNDLES): ProfileContext {
  const home = mkdtempSync(join(tmpdir(), 'copera-lock-home-'))
  homes.push(home)
  const dir = join(home, 'profiles', 'copera')
  mkdirSync(dir, { recursive: true })
  initProfile(dir, bundles)
  if (homePatch !== undefined) writeFileSync(join(home, 'cordis.patch.yml'), homePatch)
  return {
    name: 'copera', dir, patchPath: join(dir, 'cordis.patch.yml'),
    installAnchor: join(repositoryRoot, 'apps/cli/package.json'),
    cwd: home, home, startedBundles: bundles, overlayPaths: [], telemetryDisabledEnv: '1',
  }
}

/** The composed top-level rows of one profile. */
function composed(context: ProfileContext): Row[] {
  return composeEntries([readProfilePatches('copera-code', context)], (warning) => { throw new Error(warning) }) as Row[]
}

/** Rows as the lock reads them; a `!!js` condition counts as enabled, which is the conservative reading. */
function lockRows(rows: Row[]): ProductLockRow[] {
  return rows.map(row => ({ id: row.id, name: row.name, enabled: row.disabled !== true }))
}

describe('product lock over the composed copera profile', () => {
  it('holds for the shipped profile', () => {
    expect(productLockViolations({ rows: lockRows(composed(profile())), providers: ['copera'], bundles: BUNDLES })).toEqual([])
  })

  it.each([
    ['llm-pi-ai', '- id: llm-pi-ai\n  disabled: false\n'],
    ['otel', '- id: otel\n  disabled: false\n'],
    ['plugin-manager', '- id: plugin-manager\n  disabled: null\n'],
  ])('trips when the data-home patch re-enables %s', (id, patch) => {
    const violations = productLockViolations({ rows: lockRows(composed(profile(patch))), providers: ['copera'], bundles: BUNDLES })
    expect(violations).toEqual([`row "${id}" is enabled`])
  })

  it('trips when a data-home patch mounts a locked package under another id', () => {
    const patch = "- insert:\n    - id: my-models\n      name: '@deepseek-ai/dsh-llm-pi-ai'\n"
    expect(productLockViolations({ rows: lockRows(composed(profile(patch))), providers: ['copera'], bundles: BUNDLES }))
      .toEqual(['row "my-models" mounts @deepseek-ai/dsh-llm-pi-ai, which Copera Code keeps off'])
  })

  it('trips on another registered model route and on a bundle list without this bundle', () => {
    expect(productLockViolations({ rows: [], providers: ['copera', 'deepseek'], bundles: BUNDLES }))
      .toEqual(['model route "deepseek" is registered'])
    expect(productLockViolations({ rows: [], providers: ['copera'], bundles: BUNDLES.filter(name => name !== COPERA_APP_BUNDLE) }))
      .toEqual([`the profile's bundle list does not include ${COPERA_APP_BUNDLE}`])
  })

  it('lists every locked row in the composition', () => {
    const ids = new Set(composed(profile()).map(row => row.id))
    expect(LOCKED_ROW_IDS.filter(id => !ids.has(id))).toEqual([])
  })
})

/** A model registry stand-in whose routes the test changes. */
class FakeLlm {
  readonly routes = ['copera']
  listProviders(): Array<{ id: string; name: string }> { return this.routes.map(id => ({ id, name: id })) }
}

/**
 * Boot the composed rows through the Loader with the real guard and no-op stand-ins, then run the startup audit.
 * @param context - the profile to compose.
 * @returns the booted context, the model registry stand-in, the exit request spy, and the audit failure if any.
 */
async function boot(context: ProfileContext) {
  const ctx = new Context()
  const llm = new FakeLlm()
  const appExit = vi.fn()
  ctx.baseUrl = 'file:///'
  await ctx.plugin(Loader).await()
  ctx.provide('profileContext', context)
  ctx.provide('llm', llm)
  ctx.provide('appExit', appExit)
  ctx.provide('webStartup', {})
  ctx.loader.builtins.guard = Guard
  const rows = composed(context).filter(row => row.group !== true).map((row, index) => {
    // One stand-in module per row, so rows of different packages stay distinguishable by name.
    if (row.name !== COPERA_APP_BUNDLE) ctx.loader.builtins[`row-${String(index)}`] = { apply() {} }
    return {
      id: row.id,
      name: row.name === COPERA_APP_BUNDLE ? 'cordis:guard' : `cordis:row-${String(index)}`,
      ...row.disabled === undefined ? {} : { disabled: row.disabled },
      ...row.inject === undefined ? {} : { inject: row.inject },
    }
  })
  await ctx.loader.root.update(rows as EntryOptions[])
  await ctx.loader.await()
  let failure: unknown
  try { await auditStartupEntries(ctx, 'copera-code', () => {}) } catch (error) { failure = error }
  return { ctx, llm, appExit, failure }
}

describe('copera-product-lock guard at startup', () => {
  it('lets the clean profile start and provides the lock the Web server waits for', async () => {
    const { ctx, failure } = await boot(profile())
    try {
      expect(failure).toBeUndefined()
      expect(ctx.get('coperaProductLock')).toEqual({ holds: true })
      expect(ctx.loader.resolve('webserver').fiber?.state).toBe(2)
    } finally { await ctx.fiber.dispose() }
  })

  it.each([
    ['llm-pi-ai', '- id: llm-pi-ai\n  disabled: false\n'],
    ['otel', '- id: otel\n  disabled: false\n'],
  ])('fails startup when the data-home patch re-enables %s', async (id, patch) => {
    const { ctx, failure } = await boot(profile(patch))
    try {
      expect(failure).toBeInstanceOf(StartupError)
      expect((failure as Error).message).toContain(`Copera Code product lock: row "${id}" is enabled`)
      expect(ctx.get('coperaProductLock')).toBeUndefined()
    } finally { await ctx.fiber.dispose() }
  })

  it('fails startup when the data-home patch disables the guard itself', async () => {
    const { ctx, failure } = await boot(profile('- id: copera-product-lock\n  disabled: true\n'))
    try {
      expect(failure).toBeInstanceOf(StartupError)
      expect((failure as Error).message).toContain('webserver')
    } finally { await ctx.fiber.dispose() }
  })

  it('withdraws the lock, stopping the Web server, and requests exit when another model route registers later', async () => {
    const { ctx, llm, appExit, failure } = await boot(profile())
    try {
      expect(failure).toBeUndefined()
      llm.routes.push('deepseek')
      ctx.emit('llm/adapters-updated')
      await ctx.loader.await()
      expect(ctx.get('coperaProductLock')).toBeUndefined()
      // FiberState.ACTIVE is 2; the Web server leaves it once the service it injects is withdrawn.
      expect(ctx.loader.resolve('webserver').fiber?.state).not.toBe(2)
      expect(appExit).toHaveBeenCalledWith(1)
    } finally { await ctx.fiber.dispose() }
  })
})
