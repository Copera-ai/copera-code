---
description: "Copera Code product layer of the copera profile, for maintainers composing or customizing that profile."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-copera-app`

English | [中文](README.zh.md)

## Summary

The Copera Code product layer as a `dsh` profile bundle. The shipped `copera` profile stacks it over [`dsh-base`](../base/README.md) and [`dsh-web-app`](../web-app/README.md). It switches off telemetry, DeepSeek accounts, DeepSeek model routes, DeepSeek web providers, and DeepSeek-only browser pages, inserts the Copera account service and the `copera` model route, and routes the default model, session titles, and compaction summaries to that route. Its `copera-product-lock` guard stops startup when a later patch layer turns any of that back on.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Start the profile

```text
dsh copera --no-open
```

The `copera` template in [`dsh-official-bundles`](../../util/official-bundles/README.md) lists this bundle last, so its patch overrides the base and Web rows. The bundle resolves from the dsh installation like the other shipped bundles.

### What you get

The Web application without these rows: OTel session telemetry and its exporter, desktop product telemetry and analytics, the DeepSeek session log and plugin inventory reporters, the DeepSeek LLM API extensions, the DeepSeek account and auth services, the DeepSeek and pi-ai model adapters, the DeepSeek web search and Web API providers, the account, notification, web search, and model settings pages, the official brand, the harness development context, upstream skills, Plugin Manager and the Plugins page, plugin and personalized-page recommendations with their action cards, message and session feedback, entry customization, and the Creator preset. [`src/product-lock.ts`](src/product-lock.ts) lists these rows. The default model is `copera`/`shikai`; session titles use `copera`/`shikai-ultra-fast`; the Web theme defaults to dark; agent web fetches send `User-Agent: copera-code/<version> (+https://github.com/Copera-ai/copera-code)`; the agent presets have no `plugin_manager` tool and no `dsh-doc` skill.

The bundle adds two rows: [`copera-account`](../../account/copera-account/README.md), which owns the Copera sign-in and provides `coperaTokens`, and [`llm-copera`](../../llm/llm-copera/README.md), which registers the `copera` route with the models `shikai` and `shikai-ultra-fast`. Without a stored sign-in or `DSH_COPERA_TOKEN`, a model request fails with an `AUTH` error before any network request. Both rows read `DSH_COPERA_API_ORIGIN` from the launching process (default `https://api.copera.ai`). `deepseek-account` stays off because both account services would listen on `/oauth/callback`.

### Product lock

The bundle inserts the `copera-product-lock` guard and makes the required `webserver` row inject its `coperaProductLock` service. After every patch layer has composed the tree (bundles, the profile `cordis.patch.yml`, the data-home `cordis.patch.yml`, and `--patch` overlays), the guard fails startup with a message naming each violation when a locked row is enabled, a locked package is mounted under another row id, a model route other than `copera` is registered, or the profile's bundle list does not include this bundle. A data-home patch that disables the guard leaves the Web server waiting for its service, so startup fails too. After startup, a newly registered model route or a reloaded profile that breaks the lock withdraws the service, which stops the Web server, and requests exit with code 1.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

| File | Content |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | `disabled: true` patches and whole-config overrides of base and Web rows, and the `copera-account` and `llm-copera` inserts |
| [`presets/standard.patch.yml`](presets/standard.patch.yml), [`presets/ptc.patch.yml`](presets/ptc.patch.yml), [`presets/minimal.patch.yml`](presets/minimal.patch.yml) | Restated agent preset declarations |
| [`src/index.ts`](src/index.ts) | The `copera-product-lock` guard plugin |
| [`src/product-lock.ts`](src/product-lock.ts) | The locked row ids and the lock check shared by the guard and the specs |

A patch replaces a row's whole `config`, so each override restates every key of the row it replaces. A preset row keeps its plugins inside `config.plugins`, and the Loader has no patch operation inside that list, so the three preset files copy the `dsh-web-app` declarations and change only the persona, the `compaction-basic` summarization route, and `tool-web` search, drop the `dsh-doc` skill directory, and drop the `tool-plugin-manager` row. [`tests/patch-ids.spec.ts`](tests/patch-ids.spec.ts) fails when a targeted row id is missing, when the patch does not disable exactly the locked rows, when an enabled row of the composed profile names a DeepSeek endpoint or endpoint package or mounts the `plugin_manager` tool, when a shipped preset declaration changes, and when the enabled rows of the `copera` or Desktop composition or the preset ids differ from the reviewed snapshots in `tests/expected/`. [`tests/product-lock.spec.ts`](tests/product-lock.spec.ts) composes the profile with app-boot's profile reader and boots the guard through the Loader and the startup audit. [`tests/wiring.spec.ts`](tests/wiring.spec.ts) boots the profile's `llm`, `credentials`, `copera-account`, and `llm-copera` rows through the Loader against a local fake Copera API and checks the token refresh, the 401 replay, and the signed-out `AUTH` failure.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Bundle group map](../README.md)
- [Profile composition](../../boot/app-boot/README.md#profiles)
- [Agent preset declarations](../../preset/agent-preset/README.md)

-----

<a id="model-experience"></a>
## Model Experience

### Copera Code persona

#### What the model sees

The system prompt starts with `You are Copera Code, a coding agent by Copera.` without the harness identity section. The Standard, PTC, and Minimal presets supply the same persona text; Minimal keeps its complete-prompt form without runtime context.

#### Token effect

One short fixed sentence replaces the upstream persona, which named the model; the prompt is a few tokens shorter.

#### KV Cache effect

Stable for a fixed profile and preset because the persona text has no template values. Changing it invalidates cached prefixes once.

### Web search tool removed

#### What the model sees

The Standard and PTC presets register `web_fetch` without `web_search`.

#### Token effect

The tool catalog loses the `web_search` schema.

#### KV Cache effect

Stable; the tool catalog is fixed for a profile and preset.

### Plugin manager tool removed

#### What the model sees

The Standard and PTC presets register no `plugin_manager` tool, so the model cannot list, install, or remove bundles.

#### Token effect

The tool catalog loses the `plugin_manager` schema.

#### KV Cache effect

Stable; the tool catalog is fixed for a profile and preset.

### Harness documentation skill removed

#### What the model sees

The Standard and PTC presets do not add the `dsh-doc` skill directory, so the skill catalog does not list the skill that documents developing DeepSeek Harness itself.

#### Token effect

The skill catalog loses one entry and its description.

#### KV Cache effect

Stable; the skill catalog is fixed for a profile and preset.

### Compaction summaries

#### What the model sees

Compaction summaries are requested from `copera`/`shikai-ultra-fast` in every preset instead of the model that answered last.

#### Token effect

Summary requests are billed against the summarization model; the main conversation is unchanged.

#### KV Cache effect

A summary request uses a different model, so it shares no cache with the conversation model.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Preset restatement** — the three preset files copy the shipped declarations. A `dsh-web-app` preset change fails `tests/patch-ids.spec.ts` until the copies are refreshed.
- **Lock scope** — the guard reads the composed Loader tree, so a data-home patch that both disables the guard and removes `coperaProductLock` from the `webserver` row's `inject` runs without a lock. The agent's file tools can read the data home and, in `danger-full-access` mode or with the data home inside the session workspace, write it; the sandbox has no per-path deny list.
- **Optional bundles stay listed** — the installation's optional and on-demand bundle lists are shared with the other profiles; this bundle hides the Plugins page instead of removing them.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
