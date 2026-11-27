/**
 * Copera Shikai adapter: the generic pi-ai adapter, fixed to the `copera`
 * route, authenticated by the `coperaTokens` service, and dispatched through a
 * per-request fetch that adds `include_reasoning`, replays one rejected token,
 * and records Shikai's error responses for classification.
 * @module
 */
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiAdapterOptions, ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { COPERA_ROUTE_ID, coperaProfiles } from './config.ts'
import { shikaiFailure } from './errors.ts'
import type { ShikaiHttpFailure } from './errors.ts'
import type { CoperaTokenSource } from './token-source.ts'

/** Constructor options for {@link CoperaAdapter}. */
export interface CoperaAdapterOptions {
  /** Shikai base URL ending in `/public/v1`; the plugin validates it with `coperaBaseUrl`. */
  baseUrl: string
  /** Access-token source; read once per request and told about every 401. */
  tokens: CoperaTokenSource
  /** Resolve the optional durable attachment service at request time. */
  resolveAttachments?: PiAiAdapterOptions['resolveAttachments']
  /** Bridge one attachment reference into the current model-tool execution world. */
  resolveImageAccess?: PiAiAdapterOptions['resolveImageAccess']
}

/**
 * pi-ai auth for a route that authenticates only through the per-request
 * bearer token: no stored credential and no ambient lookup, so pi-ai can never
 * pick up another provider's key for this route.
 */
const NO_AMBIENT_AUTH: PiAiAdapterOptions['auth'] = {
  credentials: {
    read: () => Promise.resolve(undefined),
    list: () => Promise.resolve([]),
    modify: () => Promise.reject(new Error('llm-copera: the copera route stores no pi-ai credential')),
    delete: () => Promise.resolve(),
  },
  authContext: {
    env: () => Promise.resolve(undefined),
    fileExists: () => Promise.resolve(false),
  },
}

/** Request URL of any `fetch` input. */
function urlOf(input: Parameters<typeof globalThis.fetch>[0]): URL {
  if (input instanceof URL) return input
  return new URL(typeof input === 'string' ? input : input.url)
}

/** An SSE `data:` line whose JSON object starts with an `error` member, as Shikai frames an in-stream failure. */
const IN_STREAM_ERROR = /^data:\s*\{\s*"error"\s*:/u

/** Parse an error body as JSON when it is JSON, otherwise keep the text. */
function parseBody(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // Not JSON (a proxy's HTML page, for one): classification falls back to status alone.
    return text
  }
}

/** Per-request state: Shikai's final error response or in-stream error event. */
class ShikaiCall {
  failure: ShikaiHttpFailure | undefined

  constructor(private readonly tokens: CoperaTokenSource) {}

  /**
   * Fetch implementation for one stream call. A POST to `/chat/completions`
   * gets `include_reasoning: true`; a 401 reports the sent token once and
   * replays once with a different replacement; the final non-2xx response is
   * recorded before the SDK consumes it, and a 200 body is watched for an
   * in-stream error event.
   */
  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const url = urlOf(input)
    let body: BodyInit | null = init?.body ?? null
    if (init?.method === 'POST' && url.pathname.endsWith('/chat/completions') && typeof body === 'string') {
      const payload = JSON.parse(body) as Record<string, unknown>
      body = JSON.stringify({ ...payload, include_reasoning: true })
    }
    const headers = new Headers(init?.headers)
    // Read globalThis.fetch per call so a proxy-aware dispatcher installed after load still applies.
    let response = await globalThis.fetch(url, { ...init, headers, body })
    if (response.status === 401) {
      const sent = /^Bearer (.+)$/u.exec(headers.get('authorization') ?? '')?.[1]
      const replacement = sent === undefined ? undefined : await this.tokens.onRejected(sent)
      if (replacement !== undefined && replacement !== sent) {
        await response.body?.cancel()
        headers.set('authorization', `Bearer ${replacement}`)
        response = await globalThis.fetch(url, { ...init, headers, body })
      }
    }
    if (!response.ok) {
      const text = await response.clone().text()
      this.failure = { status: response.status, inStream: false, headers: response.headers, body: parseBody(text) }
      return response
    }
    return this.watchStream(response)
  }

  /**
   * Pass a 200 response body through unchanged while recording the first
   * `data: {"error":…}` event. Each chunk is forwarded before it is scanned,
   * so the scan never delays a chunk; only the current unterminated line is
   * retained between chunks.
   */
  private watchStream(response: Response): Response {
    if (response.body === null) return response
    const decoder = new TextDecoder()
    let partial = ''
    const scan = (text: string): void => {
      const lines = (partial + text).split('\n')
      partial = lines.pop() ?? ''
      for (const line of lines) this.recordStreamError(response, line)
    }
    const watched = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        controller.enqueue(chunk)
        scan(decoder.decode(chunk, { stream: true }))
      },
      flush: () => {
        scan(`${decoder.decode()}\n`)
      },
    }))
    return new Response(watched, { status: response.status, statusText: response.statusText, headers: response.headers })
  }

  /** Record one SSE line when it is the first in-stream error event. */
  private recordStreamError(response: Response, line: string): void {
    if (this.failure !== undefined || !IN_STREAM_ERROR.test(line)) return
    const body = parseBody(line.slice(line.indexOf(':') + 1).trim())
    if (typeof body !== 'object' || body === null) return
    this.failure = { status: response.status, inStream: true, headers: response.headers, body }
  }
}

/**
 * LLM adapter for the `copera` route. Model metadata comes from one shared
 * pi-ai adapter; each stream call builds its own pi-ai adapter around a
 * call-scoped fetch, so concurrent requests never share token or error state.
 */
export class CoperaAdapter extends LlmAdapter {
  private readonly profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile>
  private readonly catalog: PiAiAdapter

  constructor(private readonly options: CoperaAdapterOptions) {
    super()
    this.profiles = coperaProfiles(options.baseUrl)
    // Catalog queries never send a request, so they need no token.
    this.catalog = this.piAdapter(() => Promise.resolve(undefined))
  }

  private piAdapter(
    resolveApiKey: PiAiAdapterOptions['resolveApiKey'],
    fetch?: typeof globalThis.fetch,
  ): PiAiAdapter {
    return new PiAiAdapter({
      profiles: () => this.profiles,
      resolveApiKey,
      auth: NO_AMBIENT_AUTH,
      ...this.options.resolveAttachments === undefined ? {} : { resolveAttachments: this.options.resolveAttachments },
      ...this.options.resolveImageAccess === undefined ? {} : { resolveImageAccess: this.options.resolveImageAccess },
      ...fetch === undefined ? {} : { fetch },
    })
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return this.catalog.providerInfo(provider)
  }

  override providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined {
    return this.catalog.providerRetryPolicy(provider)
  }

  override imageRequestTarget(provider: string, model: string, image: ImageAttachmentRef): ImageRequestTarget {
    return this.catalog.imageRequestTarget(provider, model, image)
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return this.catalog.listModels(provider)
  }

  override resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return this.catalog.resolveModel(provider, model, signal)
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.provider !== COPERA_ROUTE_ID) {
      throw new LlmError(`llm-copera does not own provider "${options.provider}"`, 'NO_ADAPTER')
    }
    const token = await this.options.tokens.getAccessToken()
    if (token === undefined || token.length === 0) {
      throw new LlmError('Copera Code is signed out; sign in to Copera to use Shikai', 'AUTH')
    }
    const call = new ShikaiCall(this.options.tokens)
    const adapter = this.piAdapter(() => Promise.resolve(token), call.fetch)
    for await (const chunk of adapter.stream(options)) {
      if (chunk.type === 'finish' && chunk.reason.kind === 'error' && call.failure !== undefined) {
        yield { ...chunk, reason: { kind: 'error', failure: shikaiFailure(call.failure, chunk.reason.failure) } }
      } else {
        yield chunk
      }
    }
  }
}
