/** Locale preference stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the locale plugin. */
export const LOCALE_SETTINGS_NAMESPACE = 'locale'

/** Field carrying an explicit locale selection; absence delegates to the browser. */
export const LOCALE_PREFERENCE_FIELD = 'preference'

/** Accepted BCP 47-style language ids. */
export const LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u

/** Baseline locales required by typed namespace dictionary registration. */
export const LOCALE_IDS = ['zh', 'en'] as const

/** Baseline locale required by typed namespace dictionary registration. */
export type BuiltInLocaleId = typeof LOCALE_IDS[number]

/** Open locale identifier accepted from language-pack plugins. */
export type LocaleId = string

/** Durable locale section shared by the Host schema and the browser scope. */
export interface LocaleSettings {
  /** Explicit locale selection; absence delegates to the browser. */
  preference?: LocaleId
}

/** Durable locale schema; also the wire envelope the browser scope validates against. */
export const LocaleSettingsFields = {
  [LOCALE_PREFERENCE_FIELD]: z.string().pattern(LOCALE_ID_PATTERN).required(false),
}

/** Schema for the shared locale preference. */
export const LocaleSettingsSchema = z.object(LocaleSettingsFields)

// COPERA: deployment language catalog; absent fields keep every registered language and its own label.
/** Deployment choice of selectable languages, shared by the Host config and the browser runtime. */
export interface LocaleCatalog {
  /** Selectable language ids in display order; must include English, the fallback terminal. Absent: every registered language. */
  languages?: readonly LocaleId[] | undefined
  /** Display labels replacing a language's own label, keyed by language id. */
  labels?: Readonly<Record<LocaleId, string>> | undefined
}

// COPERA: deployment language catalog fields.
/** Schema fields of {@link LocaleCatalog}. */
export const LocaleCatalogFields = {
  // The `undefined` arm keeps an absent field absent instead of an empty list or map.
  languages: z.union([z.array(z.string().pattern(LOCALE_ID_PATTERN)), z.const(undefined)]),
  labels: z.union([z.dict(z.string().min(1)), z.const(undefined)]),
}

// COPERA: deployment language catalog schema.
const LocaleCatalogSchema = z.object(LocaleCatalogFields)

// COPERA: page global carrying the catalog to the browser half.
/** Page global the Host index render sets when a catalog is configured. */
export const LOCALE_CATALOG_GLOBAL = '__DSH_LOCALE_CATALOG__'

// COPERA: validate a catalog from Host config or the page global.
/**
 * Validate a deployment language catalog.
 * @param value - Host config fields or the page global; `undefined` means no catalog.
 * @returns the catalog with only its non-empty fields, or `undefined` when neither field is set.
 * @throws when a language id is malformed, a label is empty, or `languages` omits English.
 */
export function parseLocaleCatalog(value: unknown): LocaleCatalog | undefined {
  if (value === undefined) return undefined
  const parsed = LocaleCatalogSchema(value)
  // An empty list or map configures nothing.
  const languages = parsed.languages !== undefined && parsed.languages.length > 0 ? [...parsed.languages] : undefined
  const labels = parsed.labels !== undefined && Object.keys(parsed.labels).length > 0 ? { ...parsed.labels } : undefined
  if (languages !== undefined && !languages.some(id => id.toLowerCase() === 'en')) {
    throw new Error('locale catalog languages must include "en", the fallback language')
  }
  if (languages === undefined && labels === undefined) return undefined
  return { ...languages === undefined ? {} : { languages }, ...labels === undefined ? {} : { labels } }
}
