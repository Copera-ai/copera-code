// @vitest-environment jsdom
/** Deployment language catalog (`languages`, `labels`) and the dictionary override layer. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import type { LocaleSettings } from '@deepseek-ai/dsh-client-locale/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { parseLocaleCatalog, type LocaleCatalog } from '../src/locale-settings.ts'

const ADDITIONAL = [['ja', '日本語'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['ru', 'Русский'], ['pt', 'Português']] as const
const COPERA: LocaleCatalog = { languages: ['en', 'pt'], labels: { pt: 'Português (Brasil)' } }

function make(catalog?: LocaleCatalog, preference?: string) {
  const ctx = new Context()
  const host = stubConfigForm<LocaleSettings>()
  if (preference !== undefined) host.publish({ status: 'ready', value: { preference }, revision: 1, writable: true })
  const svc = new LocaleRuntime(ctx, host.scope, undefined, catalog)
  for (const [id, label] of ADDITIONAL) svc.addLanguage({ id, label, fallback: 'en' })
  return { ctx, svc, host }
}

const stubLanguages = (...tags: string[]): void => {
  vi.stubGlobal('navigator', { languages: tags, language: tags[0] ?? '' })
}

describe('LocaleRuntime language catalog', () => {
  beforeEach(() => { stubLanguages('en-US') })
  afterEach(() => { vi.unstubAllGlobals() })

  it('exposes exactly the configured languages, in configured order, with configured labels', () => {
    const { svc } = make({ languages: ['pt', 'en'], labels: { pt: 'Português (Brasil)' } })
    expect(svc.getLocale().locales).toEqual([
      { id: 'pt', label: 'Português (Brasil)', fallback: 'en' },
      { id: 'en', label: 'English' },
    ])
    expect(make(COPERA).svc.getLocale().locales.map(locale => locale.id)).toEqual(['en', 'pt'])
  })

  it('falls back to English for a saved preference outside the configured languages', () => {
    const { svc } = make(COPERA, 'zh')
    expect(svc.getLocale().active).toBe('en')
    expect(make(COPERA, 'pt').svc.getLocale().active).toBe('pt')
  })

  it('opens a Chinese browser in English and a Brazilian browser in Portuguese', () => {
    stubLanguages('zh-CN')
    expect(make(COPERA).svc.getLocale().active).toBe('en')
    stubLanguages('pt-BR', 'en')
    expect(make(COPERA).svc.getLocale().active).toBe('pt')
  })

  it('refuses to select a language outside the configured list', () => {
    const { svc, host } = make(COPERA)
    expect(() => { svc.setLocale('zh') }).toThrow(/not registered/)
    svc.setLocale('pt')
    expect(host.set).toHaveBeenCalledWith('preference', 'pt')
  })

  it('keeps dictionaries of unlisted languages for fallback chains of listed ones', () => {
    const { svc } = make({ languages: ['en', 'pt-BR'] })
    svc.addLanguage({ id: 'pt-BR', label: 'Português (Brasil)', fallback: 'pt' })
    svc.register('ns', 'en', { hello: 'Hello', only: 'English' })
    svc.register('ns', 'pt', { hello: 'Olá' })
    svc.setLocale('pt-BR')
    expect(svc.bind('ns')('hello')).toBe('Olá')
    expect(svc.bind('ns')('only')).toBe('English')
  })

  it('keeps every registered language and its own label without a catalog', () => {
    const { svc } = make()
    expect(svc.getLocale().locales.map(locale => [locale.id, locale.label])).toEqual([
      ['zh', '中文'], ['en', 'English'], ...ADDITIONAL,
    ])
    svc.setLocale('zh')
    expect(svc.getLocale().active).toBe('zh')
  })

  it('validates the injected catalog and requires English, the fallback terminal', () => {
    expect(parseLocaleCatalog(undefined)).toBeUndefined()
    expect(parseLocaleCatalog({ languages: ['en', 'pt'], labels: { pt: 'Português (Brasil)' } })).toEqual(COPERA)
    expect(() => parseLocaleCatalog({ languages: ['pt'] })).toThrow(/"en"/)
    expect(() => parseLocaleCatalog({ languages: ['en', 'bad locale'] })).toThrow()
    expect(() => parseLocaleCatalog({ labels: { pt: '' } })).toThrow()
  })
})

describe('LocaleRuntime dictionary overrides', () => {
  beforeEach(() => { stubLanguages('en-US') })
  afterEach(() => { vi.unstubAllGlobals() })

  it('resolves an override over the registered entry of its language and restores it on dispose', () => {
    const { svc } = make()
    svc.register('ns', 'en', { k: 'upstream', other: 'kept' })
    svc.register('ns', 'pt', { k: 'original' })
    const revision = svc.getLocale().revision
    const dispose = svc.override('ns', 'en', { k: 'x' })
    expect(svc.getLocale().revision).toBe(revision + 1)
    const t = svc.bind('ns')
    expect(t('k')).toBe('x')
    expect(t('other')).toBe('kept')
    svc.setLocale('pt')
    expect(t('k')).toBe('original')
    dispose()
    dispose()
    svc.setLocale('en')
    expect(t('k')).toBe('upstream')
  })

  it('stacks layers, applies before or after the dictionary, and reaches the common namespace', () => {
    const { svc } = make()
    const first = svc.override('ns', 'en', { k: 'first', a: 'A' })
    svc.override('ns', 'en', { k: 'second' })
    svc.override('common', 'EN', { retry: 'Try again' })
    svc.register('ns', 'en', { k: 'upstream', a: 'a' })
    svc.register('common', 'en', { retry: 'Retry' })
    expect(() => svc.register('ns', 'en', { k: 'duplicate' })).toThrow(/already has locale/)
    const t = svc.bind('ns')
    expect(t('k')).toBe('second')
    expect(t('a')).toBe('A')
    expect(t('retry')).toBe('Try again')
    first()
    expect(t('a')).toBe('a')
    expect(t('k')).toBe('second')
  })

  it('rejects malformed locale ids', () => {
    const { svc } = make()
    expect(() => svc.override('ns', 'bad locale', {})).toThrow(/BCP 47/)
  })
})
