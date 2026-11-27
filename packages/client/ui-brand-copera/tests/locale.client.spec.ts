/**
 * Product-name copy in the `copera` profile: after the Copera overrides, no English or Portuguese entry of a
 * dictionary owned by an enabled browser plugin names the upstream product or the DeepSeek account.
 *
 * Enabled plugins are the `dsh-web-app` rows the `dsh-copera-app` patch does not switch off. Their dictionaries
 * are the `en`/`pt` exports (`en`, `fooEn`, `enFoo`, and the `pt` forms) of every module under `src` whose path
 * names a locale. The namespace each module registers under is pinned below, so a new upstream dictionary that
 * names the product fails here until it gains a namespace and overrides.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { Context } from '@deepseek-ai/cordis'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { LOCALE_OVERRIDES, OVERRIDE_LANGUAGES, type OverrideLanguage } from '../src/client/locale-overrides.ts'

const ROOT = resolve(import.meta.dirname, '../../../..')

/** Upstream product and account names that must not reach the Copera Code UI. Lowercase `dsh` tokens are identifiers. */
const UPSTREAM_NAME = /DeepSeek|Harness|\bDSH\b/

/** Namespace of each dictionary module that contains an upstream name or a Portuguese correction, by repository path. */
const MODULE_NAMESPACES: Readonly<Record<string, string>> = {
  'packages/client/locale/src/locales/index.ts': 'common',
  'packages/client/locale/src/locales/en.ts': 'common',
  'packages/client/locale/src/locales/pt.ts': 'common',
  'packages/client/ui-shortcuts/src/client/locales.ts': 'shortcuts',
  'packages/client/ui-sidebar-documentpreview/src/client/office/locales.ts': 'sidebarOffice',
  'packages/client/ui-sidebar-browser/src/client/locales.ts': 'sidebarBrowser',
  'packages/client/remote-connection/src/client/locales.ts': 'remoteConnection',
  'packages/client/remote-connection/src/client/pairing-locales.ts': 'remoteConnection',
  'packages/client/ui-conversation/src/client/locales.ts': 'conversation',
  'packages/client/ui-chat/src/client/locale.ts': 'chat',
  'packages/client/ui-trajectory/src/client/locales.ts': 'trajectory',
  'packages/client/ui-action-cards/src/client/locales.ts': 'actionCards',
  'packages/client/ui-creation-recommendations/src/client/locales.ts': 'creationRecommendations',
  'packages/client/ui-plugin-recommendations/src/client/locales.ts': 'pluginRecommendations',
  'packages/client/ui-schedule/src/client/recommendation-locales.ts': 'schedule.manager',
  'packages/client/ui-schedule/src/client/task-manager-locales.ts': 'schedule.manager',
  'packages/client/ui-model-selection/src/client/locales.ts': 'model',
  'packages/client/ui-agent-preset/src/client/guide-locales.ts': 'settings.agentPreset',
  'packages/client/ui-agent-preset/src/client/locales.ts': 'settings.agentPreset',
}

/** `!!js` expressions in bundle patches are opaque here. */
const JS_TYPE = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (source: string) => ({ js: source }) })
const SCHEMA = yaml.DEFAULT_SCHEMA.extend([JS_TYPE])

interface Row { id?: string; name?: string; disabled?: unknown; insert?: Row[] }

function patchRows(path: string): Row[] {
  return yaml.load(readFileSync(resolve(ROOT, path), 'utf8'), { schema: SCHEMA }) as Row[]
}

/** Workspace directory of every package name. */
function packageDirectories(): Map<string, string> {
  const directories = new Map<string, string>()
  for (const group of readdirSync(resolve(ROOT, 'packages'))) {
    const groupDir = resolve(ROOT, 'packages', group)
    if (!statSync(groupDir).isDirectory()) continue
    for (const name of readdirSync(groupDir)) {
      const manifest = join(groupDir, name, 'package.json')
      if (statSync(manifest, { throwIfNoEntry: false })?.isFile() !== true) continue
      directories.set((JSON.parse(readFileSync(manifest, 'utf8')) as { name: string }).name, join(groupDir, name))
    }
  }
  return directories
}

/** Directories of the browser plugins the composed `copera` profile mounts. */
function enabledClientPackages(): string[] {
  const disabled = new Set(patchRows('packages/bundle/copera-app/cordis.patch.yml')
    .filter(row => row.disabled === true).map(row => row.id))
  const directories = packageDirectories()
  const inserted = patchRows('packages/bundle/web-app/cordis.patch.yml').flatMap(row => row.insert ?? [])
  return [...new Set(inserted
    .filter(row => row.disabled !== true && !disabled.has(row.id) && row.name !== undefined)
    .flatMap(row => directories.get((row.name ?? '').replace(/\/(client|tools)$/, '')) ?? [])
    .filter(dir => statSync(join(dir, 'src', 'client'), { throwIfNoEntry: false })?.isDirectory() === true))]
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(file => /locale/i.test(file) && /\.ts$/.test(file) && !file.endsWith('.d.ts'))
    .map(file => join(dir, file))
}

/** Language of a dictionary export name, or undefined for other exports. */
function exportLanguage(name: string): OverrideLanguage | undefined {
  return OVERRIDE_LANGUAGES.find(language =>
    name === language || name.endsWith(language[0]!.toUpperCase() + language.slice(1)) || new RegExp(`^${language}[A-Z]`).test(name))
}

interface Dictionary { file: string; language: OverrideLanguage; entries: Record<string, string> }

let dictionaries: Dictionary[] = []

beforeAll(async () => {
  for (const dir of enabledClientPackages()) {
    for (const file of sourceFiles(resolve(dir, 'src'))) {
      const module = await import(pathToFileURL(file).href) as Record<string, unknown>
      for (const [name, value] of Object.entries(module)) {
        const language = exportLanguage(name)
        if (language === undefined || value === null || typeof value !== 'object') continue
        const entries = Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
        dictionaries.push({ file: relative(ROOT, file).split('\\').join('/'), language, entries })
      }
    }
  }
  dictionaries = dictionaries.filter(dictionary => Object.keys(dictionary.entries).length > 0)
}, 120_000)

describe('Copera Code product-name copy', () => {
  it('discovers the enabled dictionaries', () => {
    const files = new Set(dictionaries.map(dictionary => dictionary.file))
    expect(files).toContain('packages/client/ui-chat/src/client/locale.ts')
    expect(files).not.toContain('packages/client/ui-settings-models/src/client/locales.ts')
  })

  it('pins a namespace for every dictionary that names the upstream product', () => {
    const named = dictionaries.filter(dictionary => Object.values(dictionary.entries).some(value => UPSTREAM_NAME.test(value)))
    expect(named.length).toBeGreaterThan(0)
    expect([...new Set(named.map(dictionary => dictionary.file))].filter(file => MODULE_NAMESPACES[file] === undefined)).toEqual([])
  })

  it('resolves no English or Portuguese entry that names the upstream product', () => {
    vi.stubGlobal('window', undefined)
    try {
      const locale = new LocaleRuntime(new Context())
      locale.addLanguage({ id: 'pt', label: 'Português', fallback: 'en' })
      const keys = new Map<string, Set<string>>()
      for (const { file, language, entries } of dictionaries) {
        const ns = MODULE_NAMESPACES[file]
        if (ns === undefined) continue
        locale.register(`${ns}#${file}`, language, entries)
        keys.set(`${ns}#${file}`, new Set([...keys.get(`${ns}#${file}`) ?? [], ...Object.keys(entries)]))
        for (const [overriddenNs, languages] of Object.entries(LOCALE_OVERRIDES)) {
          const overrides = languages[language]
          if (overriddenNs === ns && overrides !== undefined) locale.override(`${ns}#${file}`, language, overrides)
        }
      }
      const leaks: string[] = []
      for (const language of OVERRIDE_LANGUAGES) {
        locale.setLocale(language)
        for (const [ns, nsKeys] of keys) {
          const t = locale.bind(ns)
          for (const key of nsKeys) if (UPSTREAM_NAME.test(t(key))) leaks.push(`${language} ${ns} ${key}: ${t(key)}`)
        }
      }
      expect(leaks).toEqual([])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('overrides only keys that exist upstream and never reintroduces an upstream name', () => {
    const upstreamKeys = new Map<string, Set<string>>()
    for (const { file, language, entries } of dictionaries) {
      const ns = MODULE_NAMESPACES[file]
      if (ns === undefined) continue
      const id = `${ns}/${language}`
      upstreamKeys.set(id, new Set([...upstreamKeys.get(id) ?? [], ...Object.keys(entries)]))
    }
    for (const [ns, languages] of Object.entries(LOCALE_OVERRIDES)) {
      for (const language of OVERRIDE_LANGUAGES) {
        for (const [key, value] of Object.entries(languages[language] ?? {})) {
          expect(UPSTREAM_NAME.test(value), `${ns}/${language}/${key}`).toBe(false)
          expect(upstreamKeys.get(`${ns}/${language}`)?.has(key), `${ns}/${language}/${key}`).toBe(true)
        }
      }
    }
  })

  it('describes an AUTH failure as a rejected Copera token, not an API key', () => {
    for (const [ns, key] of [['chat', 'message.failure.auth'], ['trajectory', 'details.failure.auth']] as const) {
      for (const language of OVERRIDE_LANGUAGES) {
        const value = LOCALE_OVERRIDES[ns]?.[language]?.[key]
        expect(value, `${ns}/${language}/${key}`).toMatch(/Copera/)
        expect(value, `${ns}/${language}/${key}`).not.toMatch(/API/)
      }
    }
  })
})
