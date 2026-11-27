/**
 * Fixed connection facts of the `copera` route: the Shikai endpoint, its two
 * models, and the OpenAI-compatible dialect Shikai accepts. Nothing here is
 * user-configurable; only the API origin comes from the launch environment.
 * @module
 */
import { createProvider } from '@earendil-works/pi-ai'
import type { ApiKeyAuth, Model, OpenAICompletionsCompat } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'

/** Provider route the Copera adapter owns. */
export const COPERA_ROUTE_ID = 'copera'

/** Origin used when the launch environment sets no `DSH_COPERA_API_ORIGIN`. */
export const COPERA_DEFAULT_API_ORIGIN = 'https://api.copera.ai'

/** Path prefix of Shikai's OpenAI-compatible API under the Copera origin. */
const PUBLIC_API_PATH = '/public/v1'

/** Display name of the route in model selectors. */
const DISPLAY_NAME = 'Copera'

/** Loopback hosts that may use plain `http:`, for local development servers and tests. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', '[::1]'])

/** The launch-environment variables the Copera route reads. */
export interface CoperaEnvironment {
  /** Copera API origin, such as `https://api.copera.ai`; the launcher sets or clears it. */
  DSH_COPERA_API_ORIGIN?: string
}

/**
 * Resolve Shikai's base URL from the launch environment.
 * @param env - the launch-environment values; `DSH_COPERA_API_ORIGIN` absent selects the production origin.
 * @returns the base URL ending in `/public/v1`.
 * @throws Error when the origin is not `https:` (plain `http:` is accepted only for `127.0.0.1` and `[::1]`), or
 *   carries a path, query, fragment, or credentials, because the route sends the user's access token to it.
 */
export function coperaBaseUrl(env: CoperaEnvironment): string {
  const raw = env.DSH_COPERA_API_ORIGIN ?? COPERA_DEFAULT_API_ORIGIN
  const url = URL.parse(raw)
  const secure = url?.protocol === 'https:' || (url?.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
  if (url === null || !secure) {
    throw new Error(`llm-copera: DSH_COPERA_API_ORIGIN must be an https URL (http only for 127.0.0.1 or [::1]); got "${raw}"`)
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.pathname !== '/') {
    throw new Error(`llm-copera: DSH_COPERA_API_ORIGIN must be a bare origin such as ${COPERA_DEFAULT_API_ORIGIN}; got "${raw}"`)
  }
  return `${url.origin}${PUBLIC_API_PATH}`
}

/**
 * Shikai's request dialect: `max_tokens`, the `system` role, streamed usage,
 * and no `store` or `reasoning_effort`, which are not part of its documented request.
 */
const SHIKAI_COMPAT: OpenAICompletionsCompat = {
  supportsDeveloperRole: false,
  supportsStore: false,
  supportsReasoningEffort: false,
  supportsUsageInStreaming: true,
  maxTokensField: 'max_tokens',
}

/** The two model ids Shikai accepts, with the window and output cap it serves for both. */
const SHIKAI_MODELS = [
  { id: 'shikai', name: 'Shikai' },
  { id: 'shikai-ultra-fast', name: 'Shikai Ultra-fast' },
] as const
const SHIKAI_CONTEXT_WINDOW = 200_000
const SHIKAI_MAX_TOKENS = 16_000

/**
 * Request-image and stream limits of the route. They equal llm-pi-ai's
 * profile defaults, stated here because this route builds its profile without
 * llm-pi-ai's configuration resolution.
 */
const ROUTE_LIMITS = {
  streamIdleTimeoutMs: 300_000,
  maxRequestImageBytes: 20 * 1024 * 1024,
  maxRequestImages: 50,
  imageOffloadCountQuantum: 10,
  requestImageBudgetCount: 20,
  requestImagePixelBudget: 2048 * 2048,
} as const

/**
 * Api-key auth that takes the key only from the request's `apiKey` option,
 * which pi-ai presents as the stored credential; the adapter always supplies it.
 */
const BEARER_AUTH: ApiKeyAuth = {
  name: DISPLAY_NAME,
  resolve: ({ credential }) => Promise.resolve({
    auth: credential?.key === undefined ? {} : { apiKey: credential.key },
    source: DISPLAY_NAME,
  }),
}

/**
 * Build the single fixed `copera` profile from pi-ai's public provider API.
 * @param baseUrl - Shikai's base URL; tests pass a local fake server's URL.
 * @returns the resolved profile map holding only the `copera` route.
 */
export function coperaProfiles(baseUrl: string): ReadonlyMap<string, ResolvedPiAiProviderProfile> {
  const models: Model<'openai-completions'>[] = SHIKAI_MODELS.map(({ id, name }) => ({
    id,
    name,
    api: 'openai-completions',
    provider: COPERA_ROUTE_ID,
    baseUrl,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
    contextWindow: SHIKAI_CONTEXT_WINDOW,
    maxTokens: SHIKAI_MAX_TOKENS,
    compat: { ...SHIKAI_COMPAT },
  }))
  const piProvider = createProvider<'openai-completions'>({
    id: COPERA_ROUTE_ID,
    name: DISPLAY_NAME,
    baseUrl,
    auth: { apiKey: BEARER_AUTH },
    models,
    api: openAICompletionsApi(),
  })
  const profile: ResolvedPiAiProviderProfile = {
    provider: COPERA_ROUTE_ID,
    displayName: DISPLAY_NAME,
    api: 'openai-completions',
    baseURL: baseUrl,
    ...ROUTE_LIMITS,
    retryPolicy: resolveRetryPolicy(undefined, `llm-copera: provider "${COPERA_ROUTE_ID}" retryPolicy`),
    piProvider,
    modelErrors: new Map(),
    configuredMaxTokens: new Map(models.map(model => [model.id, model.maxTokens])),
  }
  return new Map([[COPERA_ROUTE_ID, profile]])
}
