# Upstream edits (Copera Code)

Every change Copera Code makes to a file that comes from the upstream DeepSeek Harness, and every file it adds inside an upstream directory, one line each: file, what, why. Hand edits carry a `// COPERA:`, `# COPERA:`, `REM COPERA:`, or `<!-- COPERA: -->` marker where the format allows comments; strict JSON files, Markdown, binary assets, and generator outputs carry none. The base is the upstream release 0.2.3-alpha.2, `BASE=$(git merge-base master upstream/master)` until the first sync. Copera-owned trees (`packages/*/*copera*`, `scripts/copera/`, `copera/`, `.github/workflows/copera-ci.yml`) are not listed.

Check before an upstream merge: `git diff --stat "$BASE" -- . ':!packages/bundle/copera-app' ':!packages/llm/llm-copera' ':!packages/account/copera-account' ':!packages/client/ui-brand-copera' ':!packages/client/ui-copera-account' ':!packages/util/copera-launch' ':!scripts/copera' ':!copera'` must list only files named below.

## Repository root

- `README.md`, `README.zh.md`, `README.i18n.yaml` — rewritten as the Copera Code README; the zh side keeps the upstream `<a id>` anchors that other docs link; states that `COPERA_CODE_HOME` applies to the desktop app only when launched from a terminal — the fork's front page describes the product.
- `THIRD_PARTY_NOTICES.md` — regenerated with the Fonts section (Inter, OFL-1.1) by `pnpm run gen-third-party-notices` (generator output, no marker).
- `BRAND_GUIDELINES.md`, `BRAND_GUIDELINES.zh.md`, `BRAND_GUIDELINES.i18n.yaml` — appends a `## Copera Code fork` section; the upstream text and its recorded hash are unchanged — states how the fork's brand relates to the upstream guidelines.
- `package.json` — `copera-code` script running `scripts/copera/dev-launch.mjs` (strict JSON, no marker) — runs the product launcher from source.
- `tsconfig.host.json` — project references for `packages/bundle/copera-app`, `packages/account/copera-account`, `packages/llm/llm-copera`, and `packages/util/copera-launch` — every package registers in exactly one compiler aggregate, and the Typert generator analyzes only aggregate members.
- `tsconfig.client.json` — references to `packages/client/ui-brand-copera` and `packages/client/ui-copera-account` (`// COPERA:`) — same reason for the client packages.
- `tsconfig.base.json` — hand-written aliases outside the generated region: `@deepseek-ai/dsh-copera-account/types` (the generated `lib/typert.remote-client.d.ts` imports it), `@deepseek-ai/dsh-client-ui-brand-copera`, `@deepseek-ai/dsh-client-ui-copera-account` and its `/client` subpath (`// COPERA:`; `gen-tsconfig-paths` does not write `dsh-client-*` aliases).

## CLI (`apps/cli`)

- `apps/cli/package.json` — adds the `@deepseek-ai/dsh-copera-app` dependency (strict JSON, no marker) — the CLI installation must resolve every bundle a shipped template names.
- `apps/cli/src/args.ts` — the `copera-code` help lists `--host` as loopback only; `parseDshArgs` takes a `binName` (default `dsh`); for the product command `copera-code` it prints the Copera Code name, usage, description, and help (also for `-h` after a profile, which would otherwise print the Web app's DeepSeek-branded help), and has no `plugin` command; `versionText()` formats `<product> (harness <harness>)` — `copera-code --help` must not name DeepSeek Harness or `dsh`, and `--version` must print the product version.
- `apps/cli/src/bin.ts` — `RunCliOptions.binName` and `RunCliOptions.productVersion`, passed to `parseDshArgs` through `versionText` — the `@deepseek-ai/dsh-copera-launch` launcher runs the CLI as `copera-code` with the `@copera.ai/code` package version.
- `apps/cli/tests/args.spec.ts` — specs for the `copera-code` command name and the product version — covers the new branches.
- `apps/cli/tests/profile-mcp.spec.ts` — the server-manager expectation accepts `copera` beside `web` — the `copera` profile stacks `dsh-web-app`, which mounts `mcp-manager`.

## Web shell (`apps/web`)

- `apps/web/index.html` — iOS home-screen title `Copera Code` (`<!-- COPERA: -->`) — the installed Web app is named by this tag before any plugin loads.
- `apps/web/public/favicon.svg`, `favicon-dark.svg` — the Copera symbol (SVG, no marker) — `/favicon.svg` is served by the Web shell before plugins load.
- `apps/web/public/manifest.webmanifest` — name and short_name `Copera Code`, background and theme color `#050505` (strict JSON, no marker) — install metadata of the Web app.
- `apps/web/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` — rendered from the Copera symbol with `sharp` (binary) — install icons.
- `apps/web/tests/app-icons.spec.ts` — the generator's transformation specs read the upstream tile from fixtures (`// COPERA:`) — the desktop tile is now the Copera icon, which `scripts/render-app-icons.ts` was not written for.
- `apps/web/tests/fixtures/app-icons/upstream-tile.svg`, `upstream-tile-macos.svg` — added: copies of upstream `apps/desktop/resources/icon.svg` and `icon-macos.svg` at release 0.2.3-alpha.2 — inputs of the generator specs above.
- `apps/web/tests/pwa-manifest.e2e.ts` — expects the Copera manifest, iOS title, and favicons; checks the shipped icons' size and corner treatment and the generator against the upstream tile fixture (`// COPERA:`) — the shipped icons are no longer the generator's output.

## Desktop (`apps/desktop`)

- `apps/desktop/scripts/product-identity.mjs`, `product-identity.d.mts` — added: product name, app ID `ai.copera.code`, URL scheme `copera-code`, artifact prefix, package name, home directory, and the updates-off default — one source for every identity value.
- `apps/desktop/src/product-environment.ts` — added: maps `COPERA_CODE_*` to `DSH_HOME`, `DSH_TELEMETRY_DISABLED`, `DSH_COPERA_*` through `resolveProductEnv`; `applyHostProductEnvironment` re-applies the token and origin mapping to the login-shell environment with the startup data home — the Host inherits the product environment, including for Dock and Finder launches.
- `apps/desktop/package.json` — `imports: { "#product-identity": … }`; devDependency `@deepseek-ai/dsh-copera-launch` (strict JSON, no marker) — the main process reads the identity; the main bundle inlines `resolveProductEnv`.
- `apps/desktop/scripts/desktop-release-environment.mjs` — `resolveDesktopAppId` defaults to `productIdentity.appId` — app ID fixed in product-identity; `DSH_DESKTOP_APP_ID` only overrides it for test installs.
- `apps/desktop/scripts/desktop-package-environment.mjs` — `DSH_DESKTOP_UPDATES` is file-owned; local mac app ID from identity; policy and feed validation only with updates on — auto-update switch, identity.
- `apps/desktop/scripts/electron-builder-config.mjs` — productName, protocol, artifactName, and microphone text from identity; `extraMetadata.name = 'copera-code'`, `author.name = 'Copera'`, `dshDesktopUpdates`; policy and `update` only with updates on — identity, updates off.
- `apps/desktop/electron-builder.config.d.mts` — types for productName, protocol, the new extraMetadata fields, and the legal `extraResources` — matches the config.
- `apps/desktop/scripts/package-target.ts` — `DESKTOP_CLIENT_BUILD_PROFILE = 'copera'`: the build runs `--profile copera` and both packing commands receive `--client-profile copera`; no release record with updates off; `.app` and DMG names from identity — every packaging stage expects the same Copera client build profile, updates off, identity.
- `apps/desktop/scripts/pack-local-packages.ts` — `--client-profile local|copera` (default `local`), `parseLocalPackArguments`, `verifyLocalPackBuild`, entry guard — the unsigned pack checks the build record against the profile the Desktop build wrote.
- `apps/desktop/scripts/prepare-runtime.ts` — prepares only `runtime/bin`, no `runtime/cli` (the `dsh` launchers, the command-link helper, the command manager) — the upstream CLI does not ship inside Copera Code.
- `apps/desktop/scripts/smoke-runtime.ts` — the smoke plugin injects no `pluginManager` and the Host-side bundle installation check is dropped — the Copera profile mounts no Plugin Manager.
- `apps/desktop/scripts/dev.ts` — passes the development home as `COPERA_CODE_HOME` — the main process discards an inherited `DSH_HOME`.
- `apps/desktop/scripts/electron-builder-config.mjs` — `COPERA_LEGAL_RESOURCES` (LICENSE, THIRD_PARTY_NOTICES.md, OFL-Inter.txt) in `extraResources` — licence files ship in the desktop package.
- `apps/desktop/scripts/package-macos.ts` — update config and channel YAML only with updates on; `.app` and artifact names from identity — signed mac without a feed, identity.
- `apps/desktop/scripts/smoke-packaged-runtime.ts` — `.app` and `.exe` names from identity — packaged executable name.
- `apps/desktop/scripts/prepare-package-set.ts` — the closure skips `DESKTOP_OMITTED_PACKAGES` — no Computer Use in the runtime.
- `apps/desktop/scripts/development-app.ts` — dev bundle ID `ai.copera.code.dev.<hash>`, URL type `copera-code`; `developmentHomeEnvironment` exports `COPERA_CODE_HOME` — identity; the main process reads the data home from `COPERA_CODE_HOME`.
- `apps/desktop/scripts/macos-notarization-proxy.ts` — lock under `~/Library/Caches/ai.copera.code/` (literal; flock-entry loads the module standalone) — identity.
- `apps/desktop/scripts/desktop-upload-plan.ts`, `desktop-build-version-discovery.ts`, `retain-desktop-ci.ts`, `verify-retained-desktop.ts`, `installed-update-distribution.ts`, `test-windows-installer.mjs` — artifact prefix, `.app` name, and test app ID from identity — artifact names must match what electron-builder writes.
- `apps/desktop/scripts/uninstall-registration.ps1` — default `ExecutableName = 'Copera Code.exe'` and mutex `Global\CoperaCode.Command.<sid>` (`# COPERA:`) — executable name; the same mutex as `command-path.ps1`.
- `apps/desktop/scripts/command-path.ps1` — owner key and mutex `Software\CoperaCode\Command`, `Global\CoperaCode.Command.*` — isolation from a DeepSeek Harness install.
- `apps/desktop/cli/dsh`, `apps/desktop/cli/dsh.cmd` — launch `Copera Code` / `Copera Code.exe` (`# COPERA:` / `REM COPERA:`) — executable name; `prepare-runtime.ts` no longer copies them into the package.
- `apps/desktop/installer/uninstall.nsh` — report name, reads `COPERA_CODE_HOME`, protocol key `Software\Classes\copera-code`, owner key `Software\CoperaCode\Command` — the uninstaller cleans the Copera scheme and protects the Copera home.
- `apps/desktop/installer/extract-report.h`, `restart-banner.h`, `restart-status.h`, `uninstall-report.h` — product name strings, report file name, "Validate COPERA_CODE_HOME" — installer UI branding.
- `apps/desktop/installer/uninstall-data.h` — default home `~/.copera-code` — protected data home.
- `apps/desktop/installer/locales/de_DE.json`, `en_US.json`, `es_ES.json`, `fr_FR.json`, `ja_JP.json`, `pt_BR.json`, `ru_RU.json`, `zh_CN.json` — product name (strict JSON, no marker) — installer UI branding.
- `apps/desktop/installer/assets/brand.png`, `brand-dark.png`, `brand-2x.png`, `brand-dark-2x.png`, `uninstaller-sidebar.png` — Copera artwork (binary) — installer branding.
- `apps/desktop/resources/icon.png`, `icon.svg`, `icon-macos.png`, `icon-macos.svg`, `icon-windows.png`, `icon-windows.svg`, `tray-windows.ico` — Copera artwork (binary/SVG) — application icons.
- `apps/desktop/src/main.ts` — product environment mapping at module top, reported in `main()`; the login-shell environment passes through `applyHostProductEnvironment`; the Host receives `DSH_COPERA_PRODUCT_VERSION`; `updatesEnabled` from the manifest gates the update menu, automatic checks, and `updatesOpen`; terminal command item removed; About name and URL scheme from identity — environment mapping, updates off, no terminal command in v1, identity.
- `apps/desktop/src/project-manager.ts` — `desktopProfileTemplate` throws without `PROFILE_TEMPLATES.copera`; runtime pnpm overrides `dsh-cua-bundle`/`dsh-cua-mcp` → `-` — Copera profile, no Computer Use.
- `apps/desktop/src/core-package-set.ts` — `DESKTOP_OMITTED_PACKAGES`, `DESKTOP_REMOVED_DEPENDENCIES` — no Computer Use.
- `apps/desktop/src/welcome-api.ts` — `needsWelcome` returns `false` — the native DeepSeek welcome is never shown.
- `apps/desktop/src/welcome-backend.ts` — unavailable account backend, `loggedIn: false` — no `account/*` calls or reconnect loop.
- `apps/desktop/src/command-manager-entry.ts` — refuses install and remove; inspects `/usr/local/bin/copera-code` — v1 ships no terminal command.
- `apps/desktop/src/fatal-recovery.ts` — the fatal dialog shows a `Copera Code product lock:` refusal whole, without the reinstall advice, instead of the last error lines (`// COPERA:`) — the lock message sat above the pending-plugin table and was cut off.
- `apps/desktop/src/locale.ts` — product name in all locales; address-in-use copy in every locale names Copera Code; pt articles — branding.
- `apps/desktop/.env.macos.example`, `apps/desktop/.env.windows.example` — rewritten for Copera (`# COPERA:` header) — templates for unsigned and signed builds.
- `apps/desktop/tests/main-startup.spec.ts`, `welcome-startup.spec.ts`, `welcome-window.spec.ts`, `welcome-host.spec.ts` — Host environment mapping, login-shell `COPERA_CODE_*` mapping, invalid origin, `window.open`, `copera-code` scheme, updates-off menu and checks, no welcome (`// COPERA:`) — behavior changed above.
- `apps/desktop/tests/fatal-recovery.spec.ts` — added a product-lock dialog case (`// COPERA:`) — behavior changed above.
- `apps/desktop/tests/copera-client-build-profile.spec.ts` — added: a real `copera` build record through the unsigned and signed packing checks — the stages spec stubs subprocesses.
- `apps/desktop/tests/smoke-runtime.spec.ts`, `macos-signature.spec.ts` — no Host-side bundle installation probe; the legal `extraResources` (`// COPERA:`) — behavior changed above.
- `apps/desktop/tests/runtime-preparation.spec.ts`, `development-app.spec.ts`, `expected/fatal-address-in-use-zh-CN.txt` — no `runtime/cli`; `COPERA_CODE_HOME` development launcher; rebranded zh address-in-use snapshot (`// COPERA:`; snapshot regenerated with `-u`) — behavior changed above.
- `apps/desktop/tests/project-manager.spec.ts`, `prepare-package-set.spec.ts`, `package-macos.spec.ts`, `package-target-stages.spec.ts` — Copera bundles, no fallback template, Computer Use removal, real-workspace closure check (every package the `copera-app` patch names), updates-off lane, `copera` build profile and `--client-profile copera` packing (`// COPERA:`) — behavior changed above.
- `apps/desktop/tests/desktop-package-environment.spec.ts`, `desktop-policy-environment.spec.ts`, `desktop-channel-version.spec.ts`, `installer-packaging.spec.ts`, `macos-signature.spec.ts` — opt into `DSH_DESKTOP_UPDATES: 'on'` — keeps the upstream update and policy paths covered.
- `apps/desktop/tests/desktop-rollout.spec.ts` — two cross-app cases skipped (`// COPERA:`) — `apps/desktop-publisher` still names `deepseek-harness-*` artifacts; irrelevant while updates are off.
- `apps/desktop/tests/background-notice.spec.ts`, `cli-launcher.spec.ts`, `command-management.spec.ts`, `crash-report.spec.ts`, `desktop-build-version-discovery.spec.ts`, `desktop-publication-preflight.spec.ts`, `desktop-publication-summary.spec.ts`, `desktop-upload-plan.spec.ts`, `desktop-upload-run.spec.ts`, `fatal-recovery.spec.ts`, `installed-update-distribution.spec.ts`, `installed-update-package-content.spec.ts`, `installed-update-publication.spec.ts`, `macos-app-update-config.spec.ts`, `macos-notarized-application.spec.ts`, `quit-confirmation.spec.ts`, `retain-desktop-ci.spec.ts`, `tray.spec.ts`, `windows-sign.spec.ts`, `windows-update-publisher.spec.ts` — product name, app ID, and artifact name expectations — pinned identity values.
- `apps/desktop/tests/fixtures/command-path.ps1`, `fixtures/installed-update-packaging.mjs`, `windows-uninstall-data.cpp`, `windows-uninstall-smoke.ps1` — Copera registry names, home variable, and report names — pinned identity values (the last two run on Windows CI only).
- `apps/desktop/tests/expected/about-panel.json`, `application-menu-en-US.json`, `application-menu-zh-CN.json`, `command-management-win32-en-US.json`, `command-management-win32-zh-CN.json`, `fatal-address-in-use-en.txt`, `fatal-address-in-use-zh-CN.txt`, `fatal-dialog-en.txt`, `fatal-dialog-with-report-en.txt`, `fatal-dialog-with-report-zh-CN.txt`, `fatal-dialog-zh-CN.txt`, `publication-mac-arm64.md`, `publication-production-website.md`, `publication-production.md`, `publication-win-x64.md`, `stable-prerelease-mac-arm64.json`, `stable-prerelease-mac-x64.json`, `stable-prerelease-win-x64.json`, `test-release-upload-mac-arm64.json`, `test-release-upload-mac-x64.json`, `test-release-upload-win-x64.json`, `welcome/en-api-key.expected.txt`, `welcome/en-timeout.expected.txt`, `welcome/en-waiting.expected.txt`, `welcome/en.expected.txt`, `welcome/zh-CN-api-key.expected.txt`, `welcome/zh-CN-timeout.expected.txt`, `welcome/zh-CN-waiting.expected.txt`, `welcome/zh-CN.expected.txt` — snapshots regenerated with `-u` and reviewed — pinned identity values.
- `apps/desktop/tests/product-identity.spec.ts`, `apps/desktop/tests/paths.spec.ts` — added: identity values and the Copera data home — cover the new modules.

## Packages

- `packages/util/official-bundles/src/bundles.ts` — adds `PROFILE_TEMPLATES.copera` (`dsh-base`, `dsh-web-app`, `dsh-copera-app`) (`// COPERA:`) — ships the `copera` profile that `dsh copera` starts.
- `packages/util/official-bundles/tests/official-bundles.spec.ts` — expects the `copera` template — the spec pins the complete template map.
- `packages/llm/llm-pi-ai/src/adapter.ts` — optional `fetch` in `PiAiAdapterOptions`, passed through to pi-ai's `streamSimple` — llm-copera must see every HTTP attempt, including non-2xx responses and in-stream error events, which pi-ai's `onResponse` does not expose.
- `packages/host/authentication-token/src/index.ts` — Config field `entryLabel` (default `dsh web`) labels the printed entry URL (`// COPERA:`) — the copera patch sets it so the startup line reads `Copera Code: http://…`.
- `packages/host/authentication-token/tests/plugin.host.spec.ts` — passes `entryLabel`; one case for a configured label (`// COPERA:`) — covers the new field.
- `packages/host/authentication-token/README.md`, `README.zh.md`, `README.i18n.yaml` — documents `entryLabel` — the README lists every Config field.
- `packages/client/locale/src/locale-settings.ts` — adds `LocaleCatalog`, `LocaleCatalogFields`, `LOCALE_CATALOG_GLOBAL` (`__DSH_LOCALE_CATALOG__`), and `parseLocaleCatalog` — the deployment language catalog shared by Host and Client.
- `packages/client/locale/src/index.ts` — Host `Config` gains optional `languages` and `labels`, validated at load (`languages` must include `en`); when either is set a `global` index-inject row is pushed; `preference` is written as a plain key, because `gen-config-catalog` rejects computed keys once the schema has catalogued fields — Copera Code offers English and Brazilian Portuguese only.
- `packages/client/locale/src/client/index.ts` — `LocaleRuntime` takes an optional `catalog` (allow-list, order, labels; unlisted definitions stay fallback targets) and adds `override(ns, language, entries)`, a layered per-locale replacement that returns an idempotent disposer — the brand replaces upstream product-name copy without owning upstream namespaces.
- `packages/client/locale/package.json`, `packages/client/locale/tsconfig.host.json` — type-only dependency on `@deepseek-ai/dsh-host-webserver` for the `webserver/index-inject` event (strict JSON, no marker) — the Host half pushes the catalog row.
- `packages/client/locale/tests/apply.client.spec.ts` — one added case — covers the catalog through `apply`.
- `packages/client/locale/tests/catalog.client.spec.ts`, `packages/client/locale/tests/catalog.host.spec.ts` — added — cover the catalog and `override`.
- `packages/client/locale/README.md`, `README.zh.md`, `README.i18n.yaml` — document "Limiting the offered languages" and "Overriding dictionary entries" — docs accompany the API.
- `packages/client/tsdown.client.ts` — stylesheet virtual module ids name the stylesheet relative to the repository (`stylesheetVirtualId`, `stylesheetVirtualFile`) (`// COPERA:`) — Rolldown copies module ids into `//#region` comments of shipped JavaScript and source maps, which carried the build machine's absolute paths; `scripts/copera/verify-pack.ts` rejects such maps.
- `scripts/client-bundle-purity.spec.ts` — asserts the repository-relative virtual id (`// COPERA:`) — covers the change above.
- `packages/client/web/src/boot-page.ts` — the pre-plugin splash wordmark is `COPERA CODE` when `DSH_CLIENT_BUILD_PROFILE === 'copera'`, `HARNESS` otherwise (`// COPERA:`) — the brand must show before any plugin loads.
- `packages/client/ui-theme/tests/app-region-styles.client.spec.ts` — chrome-row manifest entry for the Copera sign-in screen's `.dragBand` (`// COPERA:`) — the full-window screen keeps the macOS window draggable by its top band, and the spec requires every drag mark to be listed.
- `scripts/client-build-environment.ts` — adds the `copera` client build profile (`DSH_CLIENT_BUILD_PROFILE: 'copera'`, `DSH_CLIENT_TITLE: 'Copera Code'`), resolved like `official`, and `coperaClientBuildEnvironment` (`// COPERA:`) — `official` and `local` discard inherited public values, so the tab title comes from a named profile; the Desktop packing checks require it.
- `scripts/release/families.ts` — `RELEASE_CLIENT_PROFILES`, `verifyBuildArtifacts(root, clientProfile = 'official')` (`// COPERA:`) — the signed Desktop pack requires a `copera` build record; `official` stays the default.
- `scripts/release/pack.ts` — `--client-profile official|copera` (default `official`), `parseReleasePackArguments` (`// COPERA:`) — same reason.
- `scripts/gen-third-party-notices.ts` — `renderCoperaFonts` adds the Fonts section for Inter (`// COPERA:`) — the font is not an npm dependency, and regeneration must keep its notice.
- `scripts/client-build-environment.client.spec.ts` — adds a `copera` profile case — the spec pins the profile list and its error text.
- `scripts/gen-cordis-catalog.ts` — `SERVICE_PAGE` entries `coperaAccount` and `coperaTokens` (`account.md`) and `coperaProductLock` (`boot.md`) and a `TYPE_LINK_EXEMPTIONS` entry for `CoperaAccountState` (`// COPERA:`) — the generator fails closed on an unmapped service or an unclassified signature type.
- `scripts/gen-doc-graphs.ts` — `SERVICE_ROLES` entries `coperaAccount` (service), `coperaProductLock` (service, the copera-app guard), and `coperaTokens` (seam: llm-copera defines and consumes it, copera-account provides it) (`// COPERA:`) — the generator fails closed on an unclassified service.

## Group READMEs and hand-maintained docs

- `packages/account/README.md`, `README.zh.md`, `README.i18n.yaml` — adds the `copera-account` row — the group README maps every package of the group.
- `packages/llm/README.md`, `README.zh.md`, `README.i18n.yaml` — adds the `llm-copera` row — same reason.
- `packages/bundle/README.md`, `README.zh.md`, `README.i18n.yaml` — adds the `copera-app` row — same reason.
- `packages/util/README.md`, `README.zh.md`, `README.i18n.yaml` — adds the `copera-launch` row — same reason.
- `packages/client/README.md`, `README.zh.md`, `README.i18n.yaml` — adds the `ui-brand-copera` and `ui-copera-account` rows — same reason.
- `docs/capability-seams.zh.md`, `docs/capability-seams.i18n.yaml` — the Chinese side mirrors the generated `coperaAccount`, `coperaTokens`, and `coperaProductLock` graph nodes and table rows, and the pairing record is re-recorded — the Chinese page is maintained by hand beside the generated English page.
- `docs/copera/new-package-checklist.md` — moved to `copera/docs/new-package-checklist.md` — Markdown under `docs/` must ship as an English and Chinese pair; Copera notes live outside that tree.

## Generator outputs

Regenerate these with the named command; never edit them by hand.

- `tsconfig.base.json` (generated region) — `pnpm run gen-tsconfig-paths` writes the `@deepseek-ai/dsh-copera-app`, `-copera-account`, `-llm-copera`, and `-copera-launch` aliases.
- `pnpm-lock.yaml` — `pnpm install` records the six Copera workspace packages, their dependencies, the CLI and Desktop dependencies, and the locale devDependency.
- `docs/cli-help.md`, `docs/cli-help.zh.md`, `docs/cli-help.i18n.yaml` — `pnpm run gen-cli-help` adds the `dsh copera` page.
- `docs/config-catalog.md`, `docs/config-catalog.zh.md` — `pnpm run gen-config-catalog` lists the Copera packages (including the `copera-product-lock` guard), the `locale` catalog fields, and `authentication-token`'s `entryLabel`.
- `docs/module-graph.md`, `docs/module-graph.zh.md` — `pnpm run gen-module-graph` adds the Copera nodes and their edges.
- `packages/preset/agent-preset/skills/dsh-doc/references/packages.md` — `pnpm run gen-plugin-packages` lists the Copera packages.
- `docs/subsystems/account.md`, `docs/subsystems/account.zh.md`, `docs/subsystems/boot.md`, `docs/subsystems/boot.zh.md`, `packages/extensions/tool-cordis/src/api-catalog.ts` — `pnpm run gen-cordis-catalog` adds the `ctx.coperaAccount`, `ctx.coperaTokens`, and `ctx.coperaProductLock` API entries.
- `docs/capability-seams.md`, `docs/event-producer-consumer.md`, `docs/event-producer-consumer.zh.md` — `pnpm run gen-doc-graphs` adds the Copera services (including `coperaProductLock`), the `locale` consumer of `webserver/index-inject`, and the guard's `llm/adapters-updated` listener.
- `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` — `pnpm run gen-client-catalog` adds the `copera-account.gate.mark` slot and the occupants of `ui-brand-copera` and `ui-copera-account`.

## Refreshing the restated presets

`packages/bundle/copera-app/presets/{standard,ptc,minimal}.patch.yml` copy the `dsh-web-app` preset declarations, because a Loader patch replaces a preset row's whole `config` and the Loader has no patch operation inside `config.plugins`. When `packages/bundle/copera-app/tests/patch-ids.spec.ts` reports a preset mismatch after an upstream sync, copy the new upstream declaration (drop the `- insert:` wrapper and four columns of indentation), then reapply the five Copera changes: the persona `prefix`, `summarizationProvider: copera` and `summarizationModel: shikai-ultra-fast` on `compaction-basic`, `search: false` on `tool-web` (Standard and PTC only), removal of the `dsh-doc` skill directory from `skill-filesystem` `customSkillDirs` (Standard and PTC only), and removal of the `tool-plugin-manager` row (Standard and PTC only).
