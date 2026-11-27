---
description: "Sign in to Copera through the system browser with OAuth 2.1 and PKCE, keep the rotating grant in the local credential store, and supply Copera access tokens to the copera model route."
kind: "package-reference"
---

# @deepseek-ai/dsh-copera-account

English | [中文](README.zh.md)

## Summary

Sign in to Copera from the browser and send Copera access tokens on `copera` model requests. The grant lives in the local credential store and refreshes before it expires; concurrent callers and processes share one refresh, because Copera revokes the whole login when a rotated refresh token is presented again. Without a stored sign-in, the launcher's `DSH_COPERA_TOKEN` is used. Sign-in needs the Host web server reachable on `127.0.0.1` or `[::1]` with an explicit port.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the service in a Host profile that also mounts `credentials` and the Host web server, then call the `coperaAccount` Remote namespace from a Client.

### When to choose it

Choose it for the Copera Code product, where the `copera` model route needs a Copera access token. Do not mount it beside a profile that expects the DeepSeek account flow to own `/oauth/callback`: both listen on that path of the same web server.

### Minimal configuration

The service has no Config. It reads two environment variables, which only the Copera Code launcher sets:

| Variable | Default | Meaning |
|---|---|---|
| `DSH_COPERA_API_ORIGIN` | `https://api.copera.ai` | Copera API origin for `/oauth/authorize`, `/oauth/token`, and `/oauth/revoke`. HTTPS only; plain HTTP is accepted only on `127.0.0.1` or `[::1]` for a local test server. |
| `DSH_COPERA_TOKEN` | unset | Access token used when no OAuth grant is stored. It is never refreshed or revoked. |

### Remote operations

| Method | Result |
|---|---|
| `getState()` | `CoperaAccountState`: `status`, `via` (`oauth` or `env-token`), `profile`, `attempt`, `notice` |
| `watch()` | Stream of `CoperaAccountState`, starting with the current state |
| `startSignIn(callbackOrigin, loginSource)` | Starts or joins an attempt; `attempt.authorizeUrl` is the page the browser opens |
| `cancelSignIn()` | Discards the current attempt |
| `signOut()` | Removes the stored grant, then revokes it in the background |

`callbackOrigin` must be `http://127.0.0.1:<port>` or `http://[::1]:<port>`; `localhost` is refused. An attempt waits at most 600 seconds, then reports phase `expired`. Declined consent reports `denied`, and a failed code exchange reports `failed`. When Copera rejects the stored refresh token, the grant is removed and the state carries `notice: 'session-expired'` until the next sign-in or sign-out.

### Token provider

The service provides `ctx.coperaTokens`, the `CoperaTokenSource` declared by [`llm-copera`](../../llm/llm-copera/src/token-source.ts). `getAccessToken()` returns the stored access token, refreshed when it expires within 60 seconds, or else `DSH_COPERA_TOKEN`. `onRejected(token)` refreshes once when `token` is still the stored access token, returns the stored token without a request when another caller already replaced it, and returns `undefined` for the environment token.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The grant is the credential record `copera-account/default`, bound to the API origin that issued it; a record from another origin reads as signed out. A refresh runs inside `credentials.modifyRecord`, which holds the credentials file lock, and only when the stored access token is still the stale one, so a second process that waited for the lock reuses the replacement. Within one process, concurrent refreshes share one promise. The refresh deadline is 20 seconds, below the 30-second lock wait of other writers. HTTP 400 or 401 from the token endpoint means the grant is revoked: the record is removed only when it still holds the rejected refresh token. Network failures, timeouts, and other statuses keep the record.

The callback listener runs in the `webserver/request` waterfall before web-server authentication. It answers only `GET /oauth/callback` whose `Host` equals the callback origin and whose single `state` matches in constant time; it answers 410 once the attempt stops waiting. The browser receives a static page with `Content-Security-Policy: default-src 'none'` and `Cache-Control: no-store`; no request value appears in it.

Sign-out removes the grant, publishes the signed-out state, then revokes the refresh token and the access token in the background with up to three retries after 1, 2, and 4 seconds. Disposal aborts pending revocations.

<a id="model-experience"></a>
## Model Experience

### Copera access token

#### What the model sees

Nothing. The access token authenticates HTTP requests of the `copera` model route; account state, profile, and sign-in progress never enter prompts, tool results, or Session logs.

#### Token effect

None; no model-visible text is added.

#### KV Cache effect

None; a token refresh does not change any model request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Removing a revoked grant re-reads the record under the credentials lock and deletes it in a second locked operation. A sign-in that another process stores between the two operations is deleted too; the user then signs in again.
- Only the process whose refresh Copera rejected reports `notice: 'session-expired'`; another process sees the record disappear and reports a plain signed-out state.
- `loginSource` is accepted for both UIs but does not change the browser pages yet.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
