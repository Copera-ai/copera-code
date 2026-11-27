/** Host registration for the browser locale preference. */
import type {} from '@deepseek-ai/dsh-settings'

import type { Volatile, Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

import z from '@deepseek-ai/schemastery'
import { LocaleSettingsFields } from './locale-settings.ts'
// COPERA: deployment language catalog.
import { LOCALE_CATALOG_GLOBAL, LocaleCatalogFields, parseLocaleCatalog, type LocaleCatalog } from './locale-settings.ts'

export {
  LOCALE_IDS, LOCALE_PREFERENCE_FIELD, LOCALE_SETTINGS_NAMESPACE,
  type BuiltInLocaleId, type LocaleId, type LocaleSettings,
  type LocaleCatalog, // COPERA: deployment language catalog
} from './locale-settings.ts'

/** Runtime preferences projected to the browser and the deployment language catalog. */
export interface Config extends LocaleCatalog {
  /** Explicit locale; omission follows the browser. */
  preference: Volatile<string | undefined>
}

/** Live preferences projected to the browser; `languages` and `labels` select the offered languages per deployment. */
export const Config = z.object({
  // COPERA: plain key (LOCALE_PREFERENCE_FIELD's value); the config catalog walker rejects computed keys.
  preference: LocaleSettingsFields.preference.volatile(),
  // COPERA: deployment language catalog; both fields are optional and absent by default.
  languages: LocaleCatalogFields.languages,
  labels: LocaleCatalogFields.labels,
})

/** Host preferences are consumed through the configuration form projection; a configured
 * language catalog reaches the page as a global before browser plugins start.
 * @param ctx Plugin context used for optional settings presentation.
 * @param config Validated preferences and optional language catalog.
 * @throws when `languages` omits English.
 */
export function apply(ctx: Context, config: Config): void {
  // COPERA: validate the catalog at load and publish it to every index render.
  const catalog = parseLocaleCatalog({
    ...config.languages === undefined ? {} : { languages: config.languages },
    ...config.labels === undefined ? {} : { labels: config.labels },
  })
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  // COPERA: without a catalog no row is added, so the page matches upstream.
  if (catalog !== undefined) {
    ctx.on('webserver/index-inject', (table) => {
      table.push({ kind: 'global', name: LOCALE_CATALOG_GLOBAL, value: catalog })
    })
  }
}
