---
description: "Launcher of the copera-code command, for maintainers of the Copera Code npm package and the Desktop main process."
kind: "package-reference"
---

# `@deepseek-ai/dsh-copera-launch`

English | [中文](README.zh.md)

## Summary

The launcher behind the `copera-code` command. It always boots the `copera` profile, rejects the other upstream modes, maps the user variables `COPERA_CODE_HOME`, `COPERA_CODE_TOKEN`, and `COPERA_CODE_API_ORIGIN` from the real process environment to `DSH_HOME`, `DSH_COPERA_TOKEN`, and `DSH_COPERA_API_ORIGIN`, disables telemetry, and runs the dsh CLI under the `copera-code` name. `resolveLaunch` and `resolveProductEnv` are pure, so the Desktop main process can reuse them.

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

### Run the command

```ts
import { runCoperaCode } from '@deepseek-ai/dsh-copera-launch'

await runCoperaCode()
```

The published `@copera.ai/code` package calls `runCoperaCode({ productVersion })` from its `copera-code` bin with its own package version. In the repository, `pnpm copera-code --no-open` runs the same launcher from source with the version of `scripts/copera/npm-package.template.json`. `copera-code --version` prints that version followed by the harness version, for example `0.1.0 (harness 0.2.3-alpha.2)`. `copera-code` and `copera-code web` start the Web application. The accepted options are an allowlist for local use, each also in `--name=value` form: `-h`/`--help`, `-V`/`--version`, `--port <0-65535>`, `--host <127.0.0.1|::1|localhost>`, and `--no-open`. With an information option, only the first one is passed on, so `copera-code --no-open --version` prints the version. `headless`, `acp`, `sdk`, `sdk-minimal`, `desktop`, `plugin`, any other positional argument, `--profile`, `--patch`, `--from-default-profile`, the config dumps, `--public-url`, `--trusted-host`, `--tls-cert`, `--tls-key`, a non-loopback `--host`, and any other option print an error that never repeats the value and exit with code 1. When no `--port` is given, no `cordis.patch.yml` under the data home targets the `webserver` row, and port 3080 is busy, the launcher adds `--port 0`. The launcher also sets `DSH_COPERA_PRODUCT_VERSION` to the product version, which the `copera` route names in its `User-Agent`.

### Resolve the environment

```ts
import { homedir } from 'node:os'
import { resolveProductEnv } from '@deepseek-ai/dsh-copera-launch'

const overlay = resolveProductEnv(process.env, homedir())
// { DSH_HOME, DSH_TELEMETRY_DISABLED: '1', DSH_COPERA_TOKEN, DSH_COPERA_API_ORIGIN }; undefined means delete
```

| Variable set | Source |
|---|---|
| `DSH_HOME` | `COPERA_CODE_HOME` trimmed, with a leading `~` expanded and made absolute; else `~/.copera-code`; an inherited `DSH_HOME` is ignored |
| `DSH_TELEMETRY_DISABLED` | always `1` |
| `DSH_COPERA_TOKEN` | `COPERA_CODE_TOKEN`, else deleted |
| `DSH_COPERA_API_ORIGIN` | `COPERA_CODE_API_ORIGIN` when it is a bare `https:` origin, or `http:` on `127.0.0.1` or `[::1]`, without credentials, path, query, or fragment, else deleted; any other value is an error that does not repeat it |

Apply the overlay before the harness loads any `.env` file: the harness protects only `DSH_*` names from a project's `.env`, so a cloned repository cannot redirect tokens by setting `COPERA_CODE_*` or by leaving a `DSH_COPERA_*` value in the inherited environment.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

| File | Content |
|---|---|
| [`src/resolve-launch.ts`](src/resolve-launch.ts) | `resolveLaunch` and `resolveProductEnv`: argument checks and the environment mapping |
| [`src/run.ts`](src/run.ts) | `runCoperaCode`: applies the launch to `process.argv` and `process.env`, probes port 3080, and calls `runCli({ binName: 'copera-code' })` |
| [`src/index.ts`](src/index.ts) | Public exports |

The argument check reads the values of `--host` and `--port`, so an option value is not taken for a positional. With `binName: 'copera-code'`, the dsh CLI prints the Copera Code help for `-h` and `--help` instead of the Web application's help. The npm package is generated at pack time by `scripts/copera/pack-npm.ts` and checked by `scripts/copera/verify-pack.ts`; it does not live in the workspace.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Copera Code product layer](../../bundle/copera-app/README.md)
- [Harness home paths](../home-paths/README.md)
- [Utility group map](../README.md)

-----

<a id="model-experience"></a>
## Model Experience

### Launch environment

#### What the model sees

Nothing directly. The launcher selects the `copera` profile, whose model experience the [`dsh-copera-app`](../../bundle/copera-app/README.md#model-experience) bundle describes.

#### Token effect

None; the launcher adds no prompt text, tool, or message.

#### KV Cache effect

None; the launcher runs before any model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Port fallback probes only 3080** — a profile that configures another port is not probed; the Web application reports a busy configured port itself. A configured port is detected as a `webserver` row patch in the data-home or `copera` profile `cordis.patch.yml`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
