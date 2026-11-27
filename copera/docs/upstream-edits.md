# Upstream edits (Copera Code)

Every change Copera Code makes to a file that comes from the upstream DeepSeek Harness, one line each: file, what, why. Hand edits carry a `// COPERA:` or `# COPERA:` marker where the format allows comments; strict JSON files, Markdown, and generator outputs carry none.

## Hand edits

- `packages/util/official-bundles/src/bundles.ts` — adds `PROFILE_TEMPLATES.copera` (`dsh-base`, `dsh-web-app`, `dsh-copera-app`) — ships the `copera` profile that `dsh copera` starts.
- `packages/util/official-bundles/tests/official-bundles.spec.ts` — expects the `copera` template — the spec pins the complete template map.
- `apps/cli/package.json` — adds the `@deepseek-ai/dsh-copera-app` dependency (strict JSON, no marker) — the CLI installation must resolve every bundle a shipped template names.
- `apps/cli/tests/profile-mcp.spec.ts` — the server-manager expectation accepts `copera` beside `web` — the `copera` profile stacks `dsh-web-app`, which mounts `mcp-manager`.
- `packages/llm/llm-pi-ai/src/adapter.ts` — optional `fetch` in `PiAiAdapterOptions`, passed through to pi-ai's `streamSimple` — llm-copera must see every HTTP attempt, including non-2xx responses and in-stream error events, which pi-ai's `onResponse` does not expose.
- `tsconfig.host.json` — project references for `packages/bundle/copera-app`, `packages/account/copera-account`, and `packages/llm/llm-copera` — every package registers in exactly one compiler aggregate, and the Typert generator analyzes only aggregate members.
- `tsconfig.base.json` — hand-written `@deepseek-ai/dsh-copera-account/types` alias outside the generated region — the generated `lib/typert.remote-client.d.ts` imports that subpath.
- `scripts/gen-cordis-catalog.ts` — `SERVICE_PAGE` entries `coperaAccount` and `coperaTokens` (`account.md`) and a `TYPE_LINK_EXEMPTIONS` entry for `CoperaAccountState` — the generator fails closed on an unmapped service or an unclassified signature type.
- `scripts/gen-doc-graphs.ts` — `SERVICE_ROLES` entries `coperaAccount` (service) and `coperaTokens` (seam: llm-copera defines and consumes it, copera-account provides it) — the generator fails closed on an unclassified service.
- `docs/capability-seams.zh.md`, `docs/capability-seams.i18n.yaml` — the Chinese side mirrors the generated `coperaAccount` and `coperaTokens` graph nodes and table rows, and the pairing record is re-recorded — the Chinese page is maintained by hand beside the generated English page.
- `packages/account/README.md`, `README.zh.md`, `README.i18n.yaml` — adds the `copera-account` row — the group README maps every package of the group.
- `packages/llm/README.md`, `README.zh.md`, `README.i18n.yaml` — adds the `llm-copera` row — same reason.
- `packages/bundle/README.md`, `README.zh.md`, `README.i18n.yaml` — adds the `copera-app` row — same reason.
- `docs/copera/new-package-checklist.md` — moved to `copera/docs/new-package-checklist.md` — Markdown under `docs/` must ship as an English and Chinese pair; Copera notes live outside that tree.

## Generator outputs

- `tsconfig.base.json` — `pnpm run gen-tsconfig-paths` adds the `@deepseek-ai/dsh-copera-app`, `@deepseek-ai/dsh-copera-account`, and `@deepseek-ai/dsh-llm-copera` aliases in the generated region.
- `pnpm-lock.yaml` — `pnpm install` records the three workspace packages, their dependencies, and the CLI dependency.
- `docs/cli-help.md`, `docs/cli-help.zh.md`, `docs/cli-help.i18n.yaml` — `pnpm run gen-cli-help` adds the `dsh copera` page.
- `docs/config-catalog.md`, `docs/config-catalog.zh.md` — `pnpm run gen-config-catalog` lists the three Copera packages.
- `docs/module-graph.md`, `docs/module-graph.zh.md` — `pnpm run gen-module-graph` adds the three Copera nodes and their edges.
- `packages/preset/agent-preset/skills/dsh-doc/references/packages.md` — `pnpm run gen-plugin-packages` lists `copera-account` and `llm-copera`.
- `docs/subsystems/account.md`, `docs/subsystems/account.zh.md`, `packages/extensions/tool-cordis/src/api-catalog.ts` — `pnpm run gen-cordis-catalog` adds the `ctx.coperaAccount` and `ctx.coperaTokens` API entries.
- `docs/capability-seams.md`, `docs/event-producer-consumer.md`, `docs/event-producer-consumer.zh.md` — `pnpm run gen-doc-graphs` adds the Copera services.

## Refreshing the restated presets

`packages/bundle/copera-app/presets/{standard,ptc,minimal}.patch.yml` copy the `dsh-web-app` preset declarations, because a Loader patch replaces a preset row's whole `config` and the Loader has no patch operation inside `config.plugins`. When `packages/bundle/copera-app/tests/patch-ids.spec.ts` reports a preset mismatch after an upstream sync, copy the new upstream declaration (drop the `- insert:` wrapper and four columns of indentation), then reapply the four Copera changes: the persona `prefix`, `summarizationProvider: copera` and `summarizationModel: shikai-ultra-fast` on `compaction-basic`, `search: false` on `tool-web` (Standard and PTC only), and removal of the `tool-plugin-manager` row (Standard and PTC only).
