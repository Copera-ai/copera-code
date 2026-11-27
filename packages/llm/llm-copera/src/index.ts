/**
 * Copera Shikai LLM adapter plugin. It registers the single `copera` provider
 * route, whose models are `shikai` and `shikai-ultra-fast`, and authenticates
 * every request with the access token from the required `coperaTokens`
 * service. The route has no settings: the endpoint is
 * `DSH_COPERA_API_ORIGIN` (default `https://api.copera.ai`) from the launching
 * process's own environment, plus `/public/v1`, and a non-https origin fails
 * the plugin at start. Requests identify as
 * `copera-code/<DSH_COPERA_PRODUCT_VERSION> (+https://github.com/Copera-ai/copera-code)`; the launcher sets that
 * version from the installed product.
 *
 * ```yaml
 * - id: llm-copera
 *   name: '@deepseek-ai/dsh-llm-copera'
 * ```
 *
 * @module @deepseek-ai/dsh-llm-copera
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-fs'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm'
import { CoperaAdapter } from './adapter.ts'
import { COPERA_ROUTE_ID, coperaBaseUrl, coperaUserAgent } from './config.ts'
import type {} from './token-source.ts'

export type { CoperaAdapterOptions } from './adapter.ts'
export type { CoperaEnvironment } from './config.ts'
export type { ShikaiErrorInfo, ShikaiErrorKind } from './errors.ts'
export type { CoperaTokenSource } from './token-source.ts'

export const name = 'llm-copera'
export const inject = ['llm', 'coperaTokens']

/** Register the `copera` route on the LLM runtime for the lifetime of this plugin. */
export function apply(ctx: Context): void {
  // Only the inherited process layer: a project `.env` must not redirect the user's token to another host.
  const origin = launchEnvironmentOf(ctx).getFrom('DSH_COPERA_API_ORIGIN', ['process'])?.value
  const baseUrl = coperaBaseUrl(origin === undefined ? {} : { DSH_COPERA_API_ORIGIN: origin })
  const productVersion = launchEnvironmentOf(ctx).getFrom('DSH_COPERA_PRODUCT_VERSION', ['process'])?.value
  const adapter = new CoperaAdapter({
    baseUrl,
    userAgent: coperaUserAgent(productVersion),
    tokens: ctx.coperaTokens,
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(
      attachments,
      hostPath => ctx.get('fs')?.processPathFromHostPath(hostPath),
      ref,
    ),
  })
  ctx.llm.registerAdapter([COPERA_ROUTE_ID], adapter)
}
