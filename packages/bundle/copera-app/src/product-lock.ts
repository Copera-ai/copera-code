/**
 * The Copera Code product lock: the rows the `dsh-copera-app` patch switches off, and the check that the composed
 * profile keeps them off, routes models only through Copera, and still names this bundle. The bundle spec and the
 * `copera-product-lock` guard plugin both read {@link LOCKED_ROW_IDS}, so the patch, its spec, and the runtime guard
 * cannot drift apart.
 * @module @deepseek-ai/dsh-copera-app/product-lock
 */

/** Package name of the Copera Code bundle; every Copera Code profile lists it. */
export const COPERA_APP_BUNDLE = '@deepseek-ai/dsh-copera-app'

/** The only model route Copera Code serves. */
export const COPERA_LLM_ROUTE = 'copera'

/** Service the guard provides while the lock holds; the `webserver` row injects it. */
export const PRODUCT_LOCK_SERVICE = 'coperaProductLock'

/**
 * Row ids the `dsh-copera-app` patch disables: telemetry and analytics exporters, DeepSeek accounts and model routes,
 * other model providers, DeepSeek-only surfaces, plugin installation and recommendations, and feedback without an
 * upload path. `cordis.patch.yml` must disable exactly these rows.
 */
export const LOCKED_ROW_IDS: readonly string[] = [
  // Telemetry and analytics.
  'session-telemetry-otel', 'otel', 'desktop-product-telemetry', 'product-analytics', 'session-log-deepseek',
  'ui-settings-session-log', 'plugin-package-inventory-deepseek',
  // DeepSeek accounts, other model routes, and DeepSeek web providers.
  'deepseek-llm-api-extensions', 'deepseek-account', 'deepseek-auth', 'llm-deepseek', 'llm-deepseek-account',
  'llm-pi-ai', 'web-search-deepseek', 'web-deepseek-api',
  // DeepSeek-only browser surfaces and maintainer context.
  'ui-settings-account', 'ui-account-notifications', 'ui-settings-web-search', 'ui-settings-models',
  'ui-brand-official', 'harness-dev-context', 'upstream-skills', 'entry-customization', 'preset-cordis',
  // Plugin installation, recommendations, and the cards that offer them.
  'plugin-manager', 'ui-plugin-manager', 'plugin-recommendations', 'client-ui-plugin-recommendations',
  'creation-recommendations', 'client-ui-creation-recommendations', 'action-cards', 'client-ui-action-cards',
  // Feedback, whose only recipient is the switched-off upload path.
  'message-feedback', 'command-feedback', 'ui-message-feedback',
]

/**
 * Packages that back a locked row and also, by design, other enabled rows: `preset-cordis` is one agent preset among
 * the shipped ones. Every other package of a locked row may not mount under any row id.
 */
const SHARED_PACKAGES: ReadonlySet<string> = new Set(['@deepseek-ai/dsh-agent-preset'])

/** One row of the composed profile, as the guard or a composition reads it. */
export interface ProductLockRow {
  /** Tree-local row id. */
  readonly id: string | undefined
  /** Plugin module the row loads. */
  readonly name: string | undefined
  /** Whether the row can mount: not disabled by its own or an owning row's `disabled`. */
  readonly enabled: boolean
}

/** What the lock checks. */
export interface ProductLockInput {
  /** Every row of the composed profile. */
  readonly rows: readonly ProductLockRow[]
  /** Model routes with a registered adapter. */
  readonly providers: readonly string[]
  /** Bundles the profile started with, in order. */
  readonly bundles: readonly string[]
}

/**
 * List every way the composed profile breaks the product lock.
 * @param input - Composed rows, registered model routes, and the profile's bundles.
 * @returns One sentence per violation, in row order then route order; empty when the lock holds.
 */
export function productLockViolations(input: ProductLockInput): string[] {
  const locked = new Set(LOCKED_ROW_IDS)
  const violations: string[] = []
  if (!input.bundles.includes(COPERA_APP_BUNDLE)) {
    violations.push(`the profile's bundle list does not include ${COPERA_APP_BUNDLE}`)
  }
  // A locked package mounted again under another row id is the same capability.
  const lockedPackages = new Set(input.rows.flatMap(row => row.id !== undefined && locked.has(row.id)
    && row.name !== undefined && !SHARED_PACKAGES.has(row.name) ? [row.name] : []))
  for (const row of input.rows) {
    if (!row.enabled) continue
    if (row.id !== undefined && locked.has(row.id)) violations.push(`row "${row.id}" is enabled`)
    else if (row.name !== undefined && lockedPackages.has(row.name)) {
      violations.push(`row "${row.id ?? '(anonymous)'}" mounts ${row.name}, which Copera Code keeps off`)
    }
  }
  for (const provider of input.providers) {
    if (provider !== COPERA_LLM_ROUTE) violations.push(`model route "${provider}" is registered`)
  }
  return violations
}

/**
 * Format violations as the one-line startup failure and log message.
 * @param violations - Non-empty result of {@link productLockViolations}.
 * @returns The message, naming the files that can carry such a change.
 */
export function productLockMessage(violations: readonly string[]): string {
  return `Copera Code product lock: ${violations.join('; ')}. Copera Code routes models only through Copera and keeps `
    + 'telemetry, other model providers, and plugin installation off; remove the change from cordis.patch.yml in the '
    + 'data home or its profile directory, or restore the profile bundle list, and start again.'
}
