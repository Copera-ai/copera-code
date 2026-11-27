# Copera Code

English | [中文](README.zh.md)

Copera Code is an AI coding agent by [Copera](https://app.copera.ai). It is built on [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness), the open-source agent harness developed by DeepSeek AI, and runs Copera's Shikai models through your Copera account.

Copera Code is a separate product maintained by Copera. It is not an official DeepSeek Harness release, and DeepSeek does not endorse, sponsor, or operate it. See the [brand guidelines](BRAND_GUIDELINES.md).

Developer documentation for Copera: [https://developer.copera.ai](https://developer.copera.ai)

## Preview

Copera Code is in preview. Expect breaking changes between versions.

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm` (coming soon)

The npm package is not published yet. Once it is, install `Node.js` and run:

```sh
npx @copera.ai/code
```

### Run from source

Install `Node.js` and Corepack-enabled `pnpm` (the versions are pinned in `package.json`), then run from a repository checkout:

```sh
git clone https://github.com/Copera-ai/copera-code.git
cd copera-code
pnpm install
pnpm run build
pnpm copera-code
```

`pnpm run build` prepares the repository artifacts. `pnpm copera-code` uses those built artifacts without rebuilding.

## Sign in

Choose **Sign in with Copera**. Your browser opens Copera to approve access, then returns to Copera Code.

For headless or remote use without a browser, create a Copera personal access token that has the Shikai API permission and export it as `COPERA_CODE_TOKEN` before starting Copera Code. Treat the token like a password: do not commit it or put it in a project `.env` file.

## Data and privacy

Copera Code stores its settings, sign-in credentials, and sessions in `~/.copera-code`. Set `COPERA_CODE_HOME` to use another directory. Copera Code does not read or change the data directory of a DeepSeek Harness installation.

This version sends no telemetry.

## Languages

The interface is available in English and Portuguese (Brazil).

## Relationship to DeepSeek Harness

This repository is a fork of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness). Copera merges upstream changes regularly; the [upstream sync procedure](copera/docs/upstream-sync.md) and the [list of edits to upstream files](copera/docs/upstream-edits.md) describe how.

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE). Copera Code keeps the upstream license and its copyright notice, Copyright (c) 2026 DeepSeek.

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
