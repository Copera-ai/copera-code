/**
 * @deepseek-ai/dsh-copera-app — the Copera Code product layer as a profile bundle, and the `copera-product-lock` guard
 * plugin that bundle mounts. The bundle's substance is `cordis.patch.yml` and the restated agent presets under
 * `presets/`, declared by the `dsh.bundle.patch` manifest field.
 *
 * The guard runs after every patch layer (bundles, the profile patch, the data-home patch, and command-line overlays)
 * has composed the Loader tree. It checks the live rows, the registered model routes, and the profile's bundle list
 * with {@link productLockViolations}. A violation at startup throws, and because the `webserver` row injects the
 * guard's service the required Web server never starts, so startup fails with the guard's message. A violation after
 * startup (a reloaded profile or a newly registered model route) is logged, withdraws the service, which stops the
 * Web server, and requests process exit with code 1.
 * @module @deepseek-ai/dsh-copera-app
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-llm'
import { PRODUCT_LOCK_SERVICE, productLockMessage, productLockViolations, type ProductLockRow } from './product-lock.ts'

/** The service value the guard provides while the lock holds. */
export interface CoperaProductLock {
  /** Always true; the service exists only while the lock holds. */
  readonly holds: true
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Present while the Copera Code product lock holds; the `webserver` row injects it. */
    coperaProductLock: CoperaProductLock
  }
}

/** The guard takes no configuration; the lock is a security invariant, not a tunable. */
export type Config = Record<never, never>

export const name = 'copera-product-lock'

export const inject = ['loader', 'llm', 'profileContext']

export const Config: z<Config> = z.object({})

/**
 * Check the composed profile and provide the lock service, or fail.
 * @param ctx - Guard context with the Loader, the model registry, and the launcher's profile facts.
 * @throws Error naming every violation when the lock does not hold at startup.
 */
export function apply(ctx: Context): void {
  const inspect = (): string[] => productLockViolations({
    rows: [...ctx.loader.entries()].map((entry): ProductLockRow => ({
      id: entry.options.id,
      name: typeof entry.options.name === 'string' ? entry.options.name : undefined,
      enabled: !entry.disabled,
    })),
    providers: ctx.llm.listProviders().map(provider => provider.id),
    bundles: ctx.profileContext.startedBundles,
  })
  const initial = inspect()
  if (initial.length > 0) {
    const message = productLockMessage(initial)
    ctx.logger.error(message)
    throw new Error(message)
  }
  const withdraw = ctx.provide(PRODUCT_LOCK_SERVICE, { holds: true } satisfies CoperaProductLock)
  let tripped = false
  const recheck = (): void => {
    if (tripped) return
    const violations = inspect()
    if (violations.length === 0) return
    tripped = true
    ctx.logger.error(productLockMessage(violations))
    withdraw()
    ctx.get('appExit')?.(1)
  }
  ctx.on('llm/adapters-updated', recheck)
  ctx.on('internal/status', recheck)
}
