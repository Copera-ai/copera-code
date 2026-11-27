---
description: "Copera Shikai adapter for the LLM seam, locked to the copera route."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-copera

English | [中文](README.zh.md)

## Summary

Register the `copera` provider route, which sends every model request to Copera's Shikai router through its OpenAI-compatible Chat Completions API. The route offers `shikai` and `shikai-ultra-fast` and has no settings. Each request carries the access token from the `coperaTokens` service, which this package defines and an account package provides.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

```yaml
- id: llm-copera
  name: '@deepseek-ai/dsh-llm-copera'
```

The plugin injects `llm` and `coperaTokens` and takes no configuration. The endpoint is `DSH_COPERA_API_ORIGIN` from the launching process's own environment, or `https://api.copera.ai` when unset, followed by `/public/v1`. Project and user `.env` files cannot set it. An origin that is not a bare `https:` origin fails the plugin at start, because the route sends the user's token there; plain `http:` is accepted only for `127.0.0.1` and `[::1]`.

`CoperaTokenSource` has two methods. `getAccessToken()` returns the current token or `undefined` when the user is signed out; a signed-out request fails with `AUTH` before any network I/O. `onRejected(token)` runs once when Shikai answers 401; a different replacement token replays the same request once, and anything else ends the request with `AUTH`.

Both models declare a 200,000-token context window, a 16,000-token default output cap, text and image input, and no reasoning-effort levels. The model list does not depend on sign-in state.

Shikai's HTTP errors, and `data: {"error":…}` events inside an open stream, map to harness failure codes by status and by the envelope's `code` and `type`. `insufficient_quota`, a 429 with `x-should-retry: false`, and 402 become `QUOTA`. Other 429 responses and `rate_limit_exceeded` become `RATE_LIMIT` with `retry-after` as `providerRetryAfterMs`. 401 and `permission_denied` become `AUTH`. Server errors become `SERVER`; a server error with `x-should-retry: false` keeps `HTTP_<status>` as its code, which the retry policy does not repeat. Each failure carries Shikai's own message, and the HTTP status when the failure was an HTTP response. The route uses the default retry policy, which retries `RATE_LIMIT` and server failures but not `QUOTA` or `AUTH`. `mapShikaiError` in `src/errors.ts` returns the same classification with a `messageKey` for user-facing copy.

<a id="understand-the-implementation"></a>
## Understand the implementation

`CoperaAdapter` delegates model metadata to one `PiAiAdapter` built from a fixed `openai-completions` profile, which this package assembles from pi-ai's public `createProvider` API; its stream and image limits equal llm-pi-ai's profile defaults. Each stream call builds its own `PiAiAdapter` whose `fetch` belongs to that call, so concurrent requests share no token or error state. That `fetch` refuses any request whose origin is not the configured Copera origin before sending it, follows no redirect (`redirect: 'error'`), sends `User-Agent: copera-code/<DSH_COPERA_PRODUCT_VERSION> (+https://github.com/Copera-ai/copera-code)` in place of the harness attribution and no `x-deepseek-*` header, adds `include_reasoning: true` to the Chat Completions body, performs the single 401 replay, records the final non-2xx response, and forwards each chunk of a 200 stream before scanning it for the first error event; the adapter then replaces pi-ai's flattened error text with the classified failure. pi-ai receives no stored credential and no ambient environment for this route. The request uses the `system` role, `max_tokens`, and `stream_options.include_usage`, and omits `store`.

<a id="further-exploration"></a>
## Further Exploration

[pi-ai adapter](../llm-pi-ai/README.md) · [LLM retry](../llm-retry/README.md)

<a id="model-experience"></a>
## Model Experience

### Shikai requests

#### What the model sees

This package adds no model-visible text; pi-ai's Chat Completions serialization renders the system prompt, messages, and tools.

#### Token effect

The route adds no input tokens. `include_reasoning` asks Shikai to stream the routed model's reasoning, which is recorded as reasoning output and counted in output tokens.

#### KV Cache effect

The request prefix is pi-ai's serialization of the logged context, so this package does not change cache reuse. Shikai chooses the upstream model per request, and a different upstream model does not reuse an earlier cache.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The route's limits and dialect are restated here rather than resolved by llm-pi-ai's configuration, so a change to llm-pi-ai's profile defaults does not reach this route.
- The `messageKey` values of `mapShikaiError` name copy owned by the Copera account interface; this package ships no translations for them.
- Model limits are declared here rather than read from Shikai, so a change on Shikai's side needs a release of this package.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
