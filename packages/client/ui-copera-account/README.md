---
description: "Copera Code sign-in screen and sidebar account menu: a full-window gate while signed out, browser sign-in through the coperaAccount Remote namespace, and the signed-in identity with sign-out."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-copera-account

English | [中文](README.zh.md)

## Summary

The Copera Code web and desktop clients show a full-window sign-in screen whenever the Host has no Copera credential. "Sign in with Copera" opens the Copera authorization page in the user's browser; the screen follows the attempt until it succeeds, is declined, times out, or fails, and returns with a message when the session expires. Signed in, the sidebar account menu shows the user's name, email, and workspace and offers sign-out. The package mounts the `coperaAccount` Remote namespace itself.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row in a profile that also mounts [`copera-account`](../../account/copera-account/README.md) on the Host. The row has no Config.

```yaml
- id: ui-copera-account
  name: '@deepseek-ai/dsh-client-ui-copera-account'
```

### Sign-in screen

The screen registers in `shell.overlay`, renders into `document.body` above every other layer, makes `#root` inert, keeps keyboard focus inside itself, and ignores Escape. Its primary button receives focus on mount and after each change of screen. A polite live region announces each title and description.

| Account state | Screen | Actions |
|---|---|---|
| No state received yet | Loading | None |
| State stream failed before any state | Could not load your account | Try again (`getState`) |
| Signed out | Sign in to Copera Code | Sign in with Copera |
| Signed out, `notice: 'session-expired'` | Your session expired | Sign in with Copera |
| Attempt `awaiting-browser` | Continue in your browser, with the time left until `expiresAt` | Open browser again, Cancel |
| Attempt `denied`, `expired`, or `failed`; a rejected start | The matching message | Try again |
| Window address cannot receive the callback | Sign-in is not available at this address, naming `COPERA_CODE_TOKEN` | None |
| Signed in | Hidden | — |

The callback origin comes from the address the Host web server is reached at: `127.0.0.1` and `[::1]` keep their port, `localhost:<port>` becomes `http://127.0.0.1:<port>`, and HTTPS, any other host, or an address without an explicit port is unsupported. A plain browser uses the page address and `loginSource: 'web'`; the desktop shell uses the transport's `streamBaseUrl` and `loginSource: 'desktop'`.

The `copera-account.gate.mark` child slot (single, root scope) places a brand mark before the product name; without an occupant the screen shows the name alone.

### Account menu

The menu occupies `settings.launcher`. It lists the profile's name, email, and workspace name, then Settings and Sign out. A session from the `COPERA_CODE_TOKEN` environment variable has no profile; the menu names that variable and offers no sign-out. A failed sign-out shows a toast and keeps the session.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The browser entry mounts the generated `coperaAccount` contribution with `ctx.remote.$mount`, then registers the UI once `remote.coperaAccount` is available; disposal removes the UI before the namespace. One reconnecting `$stream` over `watch()` publishes each state to a snapshot store shared by both registrations, and the response of `startSignIn` and `getState` is published the same way. A carrier loss keeps the last state and marks the view failed.

A plain browser blocks a tab opened after an await, so the click opens a blank tab first, clears its opener, and navigates it to `attempt.authorizeUrl` when `startSignIn` returns; a refused start closes it. The desktop shell routes every `window.open` of an http(s) address to the system browser and denies the window, so the desktop client opens the address directly. Open browser again calls `window.open` from the click in both clients.

Every color comes from `--dsw-*` theme tokens: the primary button uses `--dsw-alias-brand-primary` with `--dsw-alias-label-primary-foreground` text, and the screen uses `--dsw-alias-bg-base`. The Copera token layer of `ui-brand-copera` sets these to the Copera blue, white, and `#050505` in dark mode.

<a id="model-experience"></a>
## Model Experience

### Copera sign-in state

#### What the model sees

Nothing. The `coperaAccount` state, including sign-in progress and the profile, stays in the browser and the Host account service; no prompt, tool result, or Session event carries them.

#### Token effect

None; the package adds no model-visible text.

#### KV Cache effect

None; the package does not take part in building model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The Copera blue is a package-local literal until the Copera theme publishes a token for it.
- The remaining time is computed from the browser clock against the Host's `expiresAt`; clock skew between the two shifts the display, not the Host's expiry.
- A plain browser whose pop-up blocker also blocks the blank tab opened during the click shows the waiting screen without a tab; Open browser again opens it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
