# New package checklist (Copera Code)

Checks the upstream gates apply to a new workspace package under `packages/<group>/<pkg>/`. Every rule cites the script that enforces it. Recorded on `copera/v1` over the upstream `0.2.3-alpha.2` release.

## Which command runs which check

- `pnpm run lint` runs only three things: `scripts/compile-referenced-projects.ts host-contracts` (which includes the Typert generator `scripts/generate-typert.ts`), then type-aware oxlint through `scripts/run-oxlint.ts` with `.oxlintrc.json`. A Typert endpoint collision therefore fails `lint`, not just `build`.
- Every other package rule lives in gate aggregates in `scripts/run-gates.ts`: `pnpm run hygiene` (`hygieneLeafGates`, scripts/run-gates.ts:962), `pnpm run doc-sync` (`docSyncLeafGates`, scripts/run-gates.ts:983), `pnpm run check:i18n` (scripts/run-gates.ts:436), and the CI static lane (`ciSharedStaticGates`, scripts/run-gates.ts:418). CI runs all of them; `lint` alone is not enough.
- Recommended local order after adding a package: `pnpm install` → `pnpm run gen-tsconfig-paths` → `pnpm run constraints` → `pnpm run typecheck` → `pnpm run lint` → `pnpm run build` → `pnpm run hygiene` → `pnpm run doc-sync` (or the quick subset `pnpm run test:docs`).

## 1. Location and name

- [ ] Path is exactly `packages/<group>/<pkg>/`; a group directory has no `package.json` and nothing nests deeper (scripts/check-workspace-constraints.ts:642, :650).
- [ ] Name is `@deepseek-ai/dsh-<name>`. Only this prefix triggers the dsh manifest rules (scripts/check-workspace-constraints.ts:589) and the MIT license gate (scripts/verify-dsh-package-licenses.ts:10). Do not put Copera packages under `packages/experimental/` unless the experimental policy is intended: that path requires an exception entry in `scripts/experimental-package-policy.ts` (scripts/check-workspace-constraints.ts:445-460).

## 2. package.json

- [ ] `version` equals the root `package.json` version (`0.2.3-alpha.2` today) (scripts/check-workspace-constraints.ts:370-377, :523).
- [ ] Not `private`. Any `packages/<group>/<pkg>` outside `experimental/` is a release member and must set `publishConfig.access: "public"` and `repository: { type: "git", url: "git+https://github.com/deepseek-ai/deepseek-harness.git", directory: "packages/<group>/<pkg>" }` (scripts/check-workspace-constraints.ts:72, :542-561; URL at :61). Note: `docs/cookbook/adding-a-package.md` still says `private: true`; the gate wins.
- [ ] `license: "MIT"` (scripts/verify-dsh-package-licenses.ts).
- [ ] `type: "module"`, `main: "lib/index.js"`, `types: "lib/types/index.d.ts"`, `exports["."] = { types: "./lib/types/index.d.ts", default: "./lib/index.js" }` (scripts/check-workspace-constraints.ts:598-613).
- [ ] `@deepseek-ai/cordis` in both `peerDependencies` and `devDependencies` with the same range `workspace:~` (scripts/check-workspace-constraints.ts:590-597). Mirror every dsh peer in `devDependencies`.
- [ ] Workspace ranges: `workspace:*` for `@deepseek-ai/dsh-*`, `workspace:~` for vendor and native packages (scripts/check-workspace-constraints.ts:711-728). No runtime dependency on an experimental package (scripts/check-workspace-constraints.ts:677-697).
- [ ] `files` must equal the list computed by `expectedDshPackageFiles` (scripts/check-workspace-constraints.ts:622-625; `expectedDshPackageFiles` at :322-392): icons, locale JSON targets, `lib/index.js`, `lib/types/**/*.js` only when an export default points into `lib/types/`, `lib/types/**/*.d.ts`, `lib/types/**/*.d.ts.map`, `lib/**/*.js.map`, the Typert files when the matching export exists, then `src`. Copy the order from a sibling such as `packages/account/deepseek-account/package.json`.
- [ ] Locale resources: export `"./package.json"` and `"./locale/*.json"` and list `locale/*.json` in `files` when the package ships `locale/` (`pnpm run verify-package-meta`, scripts/verify-package-meta.ts).
- [ ] Dependency sections must match what the published Host and Client faces import; `pnpm run verify-package-dependencies` reports and can repair drift (scripts/verify-package-dependencies.ts).
- [ ] No package `bin`. Only `dsh` profiles launch Node apps; new bins need an allowlist entry (scripts/verify-application-entrypoints.ts:27, :33).

## 3. TypeScript project wiring

- [ ] `tsconfig.json` extends `../../../tsconfig.base.json` (Client packages: `tsconfig.base.client.json`), sets `rootDir: "src"`, `outDir: "lib/types"`, `include: ["src"]`, and references `vendor/cosmokit`, `vendor/cordis`, `vendor/schemastery` when Config is used, and every dsh dependency (docs/cookbook/adding-a-package.md section 1; packages/AGENTS.md).
- [ ] Add `{ "path": "./packages/<group>/<pkg>" }` to exactly one aggregate: `tsconfig.host.json` (Host) or `tsconfig.client.json` (Client). The Typert generator only analyzes packages listed in these aggregates (packages/typert/generator/src/analyzer.ts:531-545).
- [ ] Run `pnpm run gen-tsconfig-paths`; it rewrites the generated alias region of `tsconfig.base.json` (scripts/gen-tsconfig-paths.ts:27). `pnpm run verify-tsconfig-paths` fails in `doc-sync` until it is current. This edits an upstream file; log it in `copera/docs/upstream-edits.md`.
- [ ] Subpath exports such as `./types` or `./client-metadata` need a hand-written alias outside the generated region (see `@deepseek-ai/dsh-deepseek-account/types` at tsconfig.base.json:61). Without it, a generated `lib/typert.remote-client.d.ts` that imports `<pkg>/types` fails with TS2307 (verified with a probe package in B0).
- [ ] Source rules: explicit `.ts` relative imports; `src/types.ts` holds types only; tests under `tests/`, not `src/__tests__/` (packages/AGENTS.md).

## 4. Lint (type-aware oxlint) and code gates

- [ ] `pnpm run lint` passes: `.oxlintrc.json` enables type-aware TypeScript rules such as `no-non-null-assertion`, `require-await`, `no-unnecessary-condition`, `only-throw-error`, `restrict-template-expressions`, and `switch-exhaustiveness-check` for package sources. The lefthook pre-commit job runs the staged config `.oxlintrc.staged.json` with `--fix`.
- [ ] No new `as unknown` casts (`verify-no-unknown-casts`, baseline `scripts/no-unknown-casts.baseline.json`). An empty `catch` names the error and keeps its `try` to one statement (`verify-empty-catch`). No module-scope `await` (`verify-no-top-level-await`). Use proxy-aware dispatchers, not a bare undici dispatcher (`verify-no-bare-dispatcher`). No new Cordis root reads (`verify-cordis-root`). All are in `sharedHygieneGates` (scripts/run-gates.ts:444-461).
- [ ] Plugin entry `src/index.ts` exports only what the Loader loads: a service default-exports its class; a function plugin exports `name`, `inject`, `Config`, `apply` and no default (scripts/verify-plugin-entry-exports.ts).
- [ ] JSDoc: every exported declaration has description prose; exported functions and public methods document each `@param` and non-void `@returns`. `Config`, `inject`, `name`, `reusable`, `apply`, constructors, and inherited members are exempt (scripts/verify-export-jsdoc.ts:18-21, :160, :183). Runs in `doc-sync`.
- [ ] Typert: every Remote boundary type must be exported from a public non-root type subpath such as `./types` (generator error observed in B0). Remote endpoints `<namespace>/<method>` must be unique across all analyzed packages, whether or not the package exports `./typert` or `./remote` (packages/typert/generator/src/analyzer.ts:2101-2120, called at :722).
- [ ] A package that exports `./typert` must list `lib/typert.host.js` and `lib/typert.host.d.ts` in `files`; a Host package with Remote methods that exports `./remote` must use `{ types: "./lib/typert.remote-client.d.ts", default: "./lib/typert.remote-client.js" }` and list the three `lib/typert.remote-client.*` files (packages/typert/generator/src/workspace.ts:116-170).

## 5. Product reachability

- [ ] Every non-experimental package must be reached by a shipped profile in `PROFILE_TEMPLATES` of `packages/util/official-bundles/src/bundles.ts` (directly or through a bundle patch), by an optional bundle, by `apps/cli/src/bin.ts`, `apps/desktop/src/main.ts`, or `apps/web/index.html`, or else carry a `PRODUCT_PACKAGE_POLICY` entry (scripts/verify-product-use.ts:17, :186-250; scripts/product-package-policy.ts:18). Error text: `no product runtime use; mount it, declare its maintained role, or move it to experimental`.
- [ ] A bundle named in a profile must declare `dsh.bundle.patch` (scripts/verify-product-use.ts:198). Bundle patch files join `files` automatically (scripts/check-workspace-constraints.ts:330-333).
- [ ] After adding or changing an official bundle run `pnpm run gen-official-bundle-catalog` (writes `packages/util/official-bundles/src/catalog.generated.ts`).

## 6. README (bilingual, gated sections)

- [ ] `README.md`, `README.zh.md`, and `README.i18n.yaml` all exist; pairs merge whole (scripts/verify-translation-pairing.ts:221; scope rule scripts/translation-pairing.ts:110). Each file links the other through the language switcher line (scripts/verify-translation-pairing.ts:316-319). Record hashes with `pnpm run verify-translation-pairing --write packages/<group>/<pkg>/README.md`. The pre-commit hook re-checks staged `*.i18n.yaml`.
- [ ] Frontmatter `description` and `kind` (for example `package-reference`), H1 with the package name, and the template sections from `.agents/skills/dsh-doc-writing/templates/<kind>.md`.
- [ ] `## Summary` exists and has at most 100 words (scripts/verify-package-readme-summaries.ts:9, :42).
- [ ] `## Model Experience` and `## Known Limitations and Deferred Work` are the final two H2 sections, in that order (scripts/verify-package-readme-model-experience.ts:13-14, :442-452).
- [ ] Model Experience uses the full form: one or more `###` entries, each with `#### What the model sees`, `#### Token effect`, `#### KV Cache effect` and one paragraph each (scripts/verify-package-readme-model-experience.ts:15-18, :504-506). The short `None, as …` / `Indirectly, through …` form is allowed only for packages listed in `SENTENCE_MODEL_EXPERIENCE` (scripts/verify-package-readme-model-experience.ts:52, :463-498), which is an upstream edit.
- [ ] Exactly one `## Known Limitations and Deferred Work` section with at least one top-level `- ` bullet (scripts/verify-package-readme-limitations.ts:16, :51-86). The alternative, a `NO_LIMITATIONS` entry (scripts/verify-package-readme-limitations.ts:19), is an upstream edit.
- [ ] One physical line per paragraph (`verify-md-wrap`), working relative links (`verify-md-links`), no stale `packages/...` paths (`verify-package-paths`), no banned vague terms (`verify-concrete-terms`), word budgets (`verify-doc-budgets`).
- [ ] A new group directory needs a group `README.md` pair that links a `docs/subsystems/` page or a justified `GROUPS_WITHOUT_SUBSYSTEM_PAGE` entry (scripts/verify-subsystem-pages.ts:17). Prefer existing groups.

## 7. Locale and client text

- [ ] Shipped locales are `en, zh, ja, es, fr, de, ru, pt` (scripts/shipped-locales.ts:2). Any package `locale/` directory, and every package that registers a Config or no-config plugin in the config catalog, must provide all eight JSON files covering every field present in `en.json` or `zh.json`, with matching placeholders and no invisible characters (scripts/verify-locale-metadata.ts:15-40, :60). Copera delivers `zh` as a copy of `en`.
- [ ] English `meta.title` and `meta.description` use sentence case; descriptions end with punctuation (docs/cookbook/adding-a-package.md section 5).
- [ ] Client UI copy comes only from typed locale dictionaries through `t` or localized props. JSX text and copy attributes such as `label`, `title`, `placeholder`, `aria-label`, `alt` are rejected when hardcoded (scripts/verify-client-ui-i18n.ts:17). Dictionary parity runs in `pnpm run check:i18n` (`scripts/locale-dictionary-parity.spec.ts`).
- [ ] Client packages follow `packages/client/AGENTS.md`: `dsh.client` in package.json, `./client` export, shared tsdown preset; `verify-client-packages` and `verify-client-route-resolution` check them.

## 8. Generated catalogs to refresh

Each `verify-*` gate below fails until its generator is rerun after adding a package. All outputs are upstream files; log each regenerated file in `copera/docs/upstream-edits.md`.

| Generator | Output |
|---|---|
| `pnpm run gen-tsconfig-paths` | `tsconfig.base.json` alias region |
| `pnpm run gen-config-catalog` | `docs/config-catalog.md` (plugins with Config) |
| `pnpm run gen-cordis-catalog` | `docs/cordis-api/inherited.md`, `packages/extensions/tool-cordis/src/api-catalog.ts` |
| `pnpm run gen-cordis-inspect-catalog` | `packages/extensions/cordis-client-runner/src/client/api-catalog.ts` |
| `pnpm run gen-client-catalog` | `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` |
| `pnpm run gen-tool-catalog` | `docs/tool-catalog.md` (model tools) |
| `pnpm run gen-doc-graphs` | `docs/capability-seams.md`, `docs/event-producer-consumer.md`, `docs/agent-lifecycle.md` |
| `pnpm run gen-module-graph` | `docs/module-graph.md` |
| `pnpm run gen-dependency-catalog` | `docs/dependency-catalog.json` and `scripts/dependency-catalog/*` (new npm dependencies) |
| `pnpm run gen-third-party-notices` | `THIRD_PARTY_NOTICES.md` (new npm dependencies) |
| `pnpm run gen-official-bundle-catalog` | `packages/util/official-bundles/src/catalog.generated.ts` |
| `pnpm run gen-plugin-packages` | skill plugin package list |
| `pnpm run gen-persistence-catalog` | persistence catalog (new persisted types) |

## 9. Tests

- [ ] Specs under `tests/`, run with `pnpm exec vitest run <file>`. Coverage is per-file 100% on `packages/*/*/src` in CI (`pnpm run test:coverage`).
- [ ] Product-visible plugins need a Loader-composition test, and registries prove disposal (packages/AGENTS.md).

## 10. Git hooks (lefthook.yml)

- pre-commit: translation pairing for staged `*.i18n.yaml`; archived Agent Notes guard; oxlint on staged `*.{ts,tsx,mts,cts,mjs}` with `--fix` and re-stage; `git diff --cached --check` (whitespace and the single trailing newline); pi-ai provider metadata check when `pnpm-lock.yaml` or llm-pi-ai files are staged; `scripts/check-vendor-manifest.sh`. Each job is limited to staged files and takes seconds.
- pre-merge-commit: translation pairing and archived Agent Notes guard.
- pre-push: `pnpm run typecheck`. Measured 13 s with warm build output; a clean tree runs the full Typert pass and both compiler faces, which takes minutes (the full `pnpm run build` took 198 s on 8 cores).
- `pnpm install` reinstalls the hooks into `.git/dsh-hooks` through `scripts/install-lefthook.mjs`. Running `pnpm install` inside a separate `git worktree` repoints the shared hooks at that worktree; rerun `node scripts/install-lefthook.mjs` in the main checkout afterwards.

## 11. Copera-specific notes

- Files under `docs/` are in the bilingual translation scope (scripts/translation-pairing.ts:168). `docs/copera/*.md` without a `.zh.md` and `.i18n.yaml` pair fails `verify-translation-pairing` in `doc-sync`; either add the pair, exclude the files in `scripts/translation-pairing.manifest.json` (upstream edit), or keep these notes outside `docs/`. Copera notes therefore live in `copera/docs/` at the repository root, which the pairing scope (scripts/translation-pairing.ts:162-168) does not cover.
- Every allowlist named above (`NO_LIMITATIONS`, `SENTENCE_MODEL_EXPERIENCE`, `PRODUCT_PACKAGE_POLICY`, `GROUPS_WITHOUT_SUBSYSTEM_PAGE`, entrypoint allowlists) is an upstream file. Prefer satisfying the rule over adding an entry.
