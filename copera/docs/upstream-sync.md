# Upstream sync (Copera Code)

How Copera Code takes changes from upstream DeepSeek Harness. Upstream is `deepseek-ai/deepseek-harness` branch `master`; the product branch is `master` on `Copera-ai/copera-code`. Run the steps in order. Every sync is a merge, never a rebase: a rebase rewrites Copera commits, and a squash or rebase landing drops the upstream parent, so the next `git merge-base` would no longer find the previous sync point.

## 1. Prepare the checkout

The remotes must be `origin` = `https://github.com/Copera-ai/copera-code.git` and `upstream` = `https://github.com/deepseek-ai/deepseek-harness.git`:

```sh
git remote add upstream https://github.com/deepseek-ai/deepseek-harness.git   # once per clone
git fetch upstream --tags
git fetch origin
git switch master
git pull --ff-only origin master
git status --short   # must be empty
corepack enable      # pnpm comes from packageManager in package.json
```

Record the previous sync point and look at what is coming:

```sh
PREV=$(git merge-base master upstream/master)
git log --oneline "$PREV..upstream/master" | wc -l
```

## 2. Merge into a sync branch

```sh
SYNC_DATE=$(date +%Y-%m-%d)
git switch -c "sync/upstream-$SYNC_DATE" master
git merge --no-ff --no-commit upstream/master
```

## 3. Resolve conflicts

The expected conflict surface is the files listed in [upstream-edits.md](upstream-edits.md). Resolve each listed file by kind:

- **Hand edits:** take the upstream version, then reapply the Copera change described in its line and keep the `// COPERA:` or `# COPERA:` marker where the format allows one.
- **Generator outputs** (`tsconfig.base.json` generated region, `pnpm-lock.yaml`, generated docs and catalogs): take the upstream side with `git checkout --theirs -- <file>`, then regenerate in step 6. A `tsconfig.base.json` conflict outside the generated region is a hand edit.
- **A conflict in a file that upstream-edits.md does not list** means an unrecorded Copera edit. Stop, find the commit with `git log master -- <file>`, and either add the missing line to upstream-edits.md or remove the edit.

After resolving, check that every upstream file Copera changes is recorded. This lists upstream files that differ from upstream after the merge, excluding Copera-owned paths:

```sh
git diff --name-only upstream/master -- . \
  ':(exclude)copera/**' ':(exclude)scripts/copera/**' \
  ':(exclude,glob)packages/*/*copera*/**' ':(exclude).github/workflows/copera-ci.yml'
```

Each path in the output must appear in upstream-edits.md, and each entry in upstream-edits.md must still appear in the output; update the file in the same merge.

## 4. Review upstream changes that affect the product

### 4.1 Bundle rows and presets

The `copera` profile stacks `dsh-base`, `dsh-web-app`, and `dsh-copera-app`. The Copera layer's spec pins the row ids it patches, the absence of enabled rows that point at a DeepSeek endpoint, the absence of the `plugin_manager` model tool, and the restated presets:

```sh
pnpm exec vitest run packages/bundle/copera-app/tests/patch-ids.spec.ts packages/bundle/copera-app/tests/wiring.spec.ts
```

The spec also snapshots the exact set of enabled rows (id and package) of the `copera` composition and of the Desktop composition on macOS and Windows, and the preset ids, in `packages/bundle/copera-app/tests/expected/` (`enabled-rows-copera.json`, `enabled-rows-desktop-darwin.json`, `enabled-rows-desktop-win32.json`, `presets.json`). Any upstream change that adds, removes, or renames an enabled row or a preset fails it. Review each difference with the decision rules below, change `cordis.patch.yml` (and `LOCKED_ROW_IDS` in `src/product-lock.ts` for a row you switch off) as needed, then rewrite the snapshots and review their diff before committing:

```sh
pnpm exec vitest run packages/bundle/copera-app -u
git diff packages/bundle/copera-app/tests/expected/
```

A row that registers a model route other than `copera`, a telemetry exporter, or plugin installation must be switched off; the `copera-product-lock` guard fails startup otherwise. Read every new or changed row in the lower layers and in the shipped profile templates:

```sh
git diff "$PREV" upstream/master -- \
  packages/bundle/base/cordis.patch.yml \
  packages/bundle/web-app/cordis.patch.yml \
  packages/bundle/web-app/presets/ \
  packages/util/official-bundles/src/bundles.ts
```

Decide per new row and record the decision in [packages/bundle/copera-app/cordis.patch.yml](../../packages/bundle/copera-app/cordis.patch.yml):

- The row reaches a DeepSeek-operated service, sends telemetry or analytics, or shows a DeepSeek-only surface: add `disabled: true` for its id.
- The row is useful but its config names a DeepSeek value (model, endpoint, provider): override its whole `config`, because a patch replaces the row's entire `config`.
- The row is product-neutral and local: leave it enabled.

### 4.2 New outbound hosts

List every host that the incoming changes add, outside vendored code and documentation:

```sh
git diff "$PREV" upstream/master -- . \
  ':(exclude)vendor/**' ':(exclude)pnpm-lock.yaml' ':(exclude,glob)**/*.md' ':(exclude)docs/**' \
  | grep -E '^\+' | grep -oE 'https?://[A-Za-z0-9.-]+' | sort -u
```

For each host, find the plugin that contacts it and whether the `copera` profile enables that plugin (`pnpm dsh --profile copera --dump-config` prints the composed tree). A DeepSeek host reachable from an enabled row is a blocker: disable or override the row as in 4.1. A third-party host needs an explicit keep or disable decision. Test fixtures and documentation links need no action.

### 4.3 New or renamed workflows

```sh
git diff --name-status "$PREV" upstream/master -- .github/workflows/
```

A workflow file that is added (`A`) or renamed (`R`) is a new workflow to GitHub and arrives enabled in the fork. Add it to the disable list in [Upstream workflows in the fork](#upstream-workflows-in-the-fork) with a one-line reason, and disable it right after the sync branch is pushed (step 8). Do not edit upstream workflow files: upstream specs pin their YAML.

## 5. Refresh the restated presets when the drift spec fails

`packages/bundle/copera-app/presets/{standard,ptc,minimal}.patch.yml` restate the `dsh-web-app` presets. When `patch-ids.spec.ts` reports `restates the shipped <id> preset with only the Copera changes` as failing, follow [Refreshing the restated presets](upstream-edits.md#refreshing-the-restated-presets): copy the new upstream declaration from `packages/bundle/web-app/presets/<id>.patch.yml`, reapply the four Copera changes listed there, and rerun the spec until it passes. Never edit the spec's expectation to match a stale copy.

## 6. Install and regenerate

```sh
pnpm install
pnpm run gen-tsconfig-paths
pnpm run build
pnpm run gen-official-bundle-catalog
pnpm run gen-cli-help
pnpm run gen-config-catalog
pnpm run gen-cordis-catalog
pnpm run gen-cordis-inspect-catalog
pnpm run gen-client-catalog
pnpm run gen-tool-catalog
pnpm run gen-doc-graphs
pnpm run gen-module-graph
pnpm run gen-plugin-packages
pnpm run gen-dependency-catalog
pnpm run gen-third-party-notices
pnpm run gen-persistence-catalog
```

`pnpm install` rewrites `pnpm-lock.yaml`; commit the result instead of the upstream copy. The generator list follows the [new package checklist](new-package-checklist.md#8-generated-catalogs-to-refresh); each `verify-*` gate in step 7 fails until its generator has run. Log any newly regenerated upstream file in upstream-edits.md under "Generator outputs".

## 7. Run the gates

```sh
pnpm run typecheck
pnpm run lint
pnpm exec vitest run packages/*/*copera*/
pnpm run constraints
pnpm run hygiene
pnpm run doc-sync
pnpm run check:i18n
pnpm exec tsx scripts/copera/pack-npm.ts
pnpm exec tsx scripts/copera/verify-pack.ts --tarball dist/copera-npm/copera.ai-code-<version>.tgz
```

All must pass, with one known exception: the `vendor rescope` gate of `hygiene` fails on the pristine upstream release 0.2.3-alpha.2, because `apps/web/tests/client-config-sync.e2e.ts` and `apps/web/tests/input-plugin-extensions.e2e.ts` carry a pre-rescope name token; upstream's own CI does not run that gate. Once a sync makes it pass, drop the exception from Copera CI. The fork's [Copera CI](../../.github/workflows/copera-ci.yml) runs every command above on each push and pull request.

## 8. Smoke test

```sh
pnpm copera-code
```

1. Choose **Sign in with Copera**; the browser approves access and returns to Copera Code.
2. Run one turn that uses a tool, such as reading a file in the workspace, and confirm that the answer arrives.
3. While the turn runs, watch outbound traffic (browser developer tools for the Web UI, or a proxy for the Host) and confirm that no request goes to a `deepseek` host.

## 9. Land the sync

1. Commit the merge on `sync/upstream-<date>` and push it to `origin`.
2. Disable any workflow found in 4.3 (commands below), then open a pull request into `master`.
3. Wait for Copera CI to pass, then merge with a merge commit. Do not squash or rebase the pull request.

## Upstream workflows in the fork

GitHub keeps Actions off in a new fork until a maintainer enables them; enabling them turns on every workflow file present. Disable the workflows below immediately after enabling Actions, and again for each new workflow a sync brings. Disabled state is stored per workflow file path on GitHub, so it survives syncs but not renames.

### Disable: automatic triggers

These run on `pull_request`, `pull_request_target`, `push`, `schedule`, `issues`, `issue_comment`, `pull_request_review`, or `workflow_run` and would run on Copera branches and pull requests.

| File | Reason |
|---|---|
| `ci.yml` | Upstream full CI; routes heavy lanes to DeepSeek larger and self-hosted runners. Copera CI replaces it. |
| `ci-windows.yml` | Upstream Windows CI on DeepSeek runners. |
| `ci-python.yml` | Python SDK CI; uses the `DEEPSEEK_API_KEY_EXTERNAL` secret. |
| `ci-master.yml` | Push-to-`master` CI on DeepSeek self-hosted runners; uses the `DEEPSEEK_API_KEY_EXTERNAL` secret. |
| `e2e.yml` | Real DeepSeek API tests on push, pull request, and a nightly schedule. |
| `release.yml` | Upstream npm release rehearsal for the `dsh` packages. |
| `release-vendor.yml` | Upstream npm release rehearsal for the vendored packages. |
| `build-preview-cloudflare.yml` | Deploys pull request previews to DeepSeek's Cloudflare account. |
| `node-addon-system.yml` | Builds the native addon on a platform matrix for upstream's npm release; Copera does not change `native/system`. |
| `sandbox.yml` | Upstream sandbox end-to-end tests on push to `master` on Linux and macOS runners; Copera does not change the sandbox packages. |
| `issue-lifecycle.yml` | Upstream issue and pull request automation through a DeepSeek GitHub App. |
| `issue-policy.yml` | Upstream issue and pull request policy checks. |
| `weighted-approval.yml` | Upstream reviewer-weight approval policy (`pull_request_target`). |
| `weighted-approval-review-event.yml` | Review-event trigger for `weighted-approval.yml`. |
| `pr-check-after-approve.yml` | Upstream merge policy (`pull_request_target`). |
| `pr-check-on-base-branch.yml` | Upstream merge policy on push to `master`. |
| `pr-check-on-head-branch.yml` | Upstream merge policy (`pull_request_target`). |
| `stale-pull-requests.yml` | Nightly reminders and closing of upstream's stale pull requests. |

### Disable: manual dispatch only

These start only from `workflow_dispatch`. Disable them so nobody publishes or packages with upstream's targets by mistake.

| File | Reason |
|---|---|
| `release-publish.yml` | Publishes the `dsh` packages to npm. |
| `release-vendor-publish.yml` | Publishes the vendored packages to npm. |
| `node-addon-system-release.yml` | Publishes the native addon to npm. |
| `python-release.yml` | Publishes the Python SDK to PyPI. |
| `publish-ssh-helper.yml` | Publishes the SSH helper to a GitHub Release. |
| `desktop-publish.yml` | Uploads Desktop builds to DeepSeek's COS buckets. |
| `desktop-rollout.yml` | Rolls out Desktop updates and the DeepSeek download website. |
| `macos-package.yml` | Packages Desktop on DeepSeek's self-hosted Apple Silicon signing runner. |
| `macos-intel-package.yml` | Packages Desktop on DeepSeek's self-hosted Intel signing runner. |
| `windows-package.yml` | Packages Desktop on DeepSeek's self-hosted Windows signing runner. |
| `cua-helper-package-macos.yml` | Packages the Computer Use helper with DeepSeek's macOS signing configuration. |
| `cua-helper-package-windows.yml` | Packages the Computer Use helper with DeepSeek's Windows signing configuration. |
| `pi-ai-provider-e2e.yml` | Real Azure OpenAI and Anthropic tests with upstream secrets. |
| `docs-pages.yml` | Deploys upstream's documentation site to GitHub Pages. |

### Keep enabled

| File | Reason |
|---|---|
| `copera-ci.yml` | Copera's own CI. |
| `expected-filenames.yml` | Path-filtered filename rule on `ubuntu-latest` with no secrets. |
| `build-exe-for-python-sdk.yml`, `build-exe-for-ssh-helper.yml` | `workflow_call` only; they run only when a disabled caller runs. |

### Commands

```sh
REPO=Copera-ai/copera-code
for wf in \
  ci.yml ci-windows.yml ci-python.yml ci-master.yml e2e.yml \
  release.yml release-vendor.yml build-preview-cloudflare.yml \
  node-addon-system.yml sandbox.yml \
  issue-lifecycle.yml issue-policy.yml \
  weighted-approval.yml weighted-approval-review-event.yml \
  pr-check-after-approve.yml pr-check-on-base-branch.yml pr-check-on-head-branch.yml \
  stale-pull-requests.yml \
  release-publish.yml release-vendor-publish.yml node-addon-system-release.yml \
  python-release.yml publish-ssh-helper.yml \
  desktop-publish.yml desktop-rollout.yml \
  macos-package.yml macos-intel-package.yml windows-package.yml \
  cua-helper-package-macos.yml cua-helper-package-windows.yml \
  pi-ai-provider-e2e.yml docs-pages.yml
do
  gh workflow disable "$wf" --repo "$REPO"
done
gh workflow list --all --repo "$REPO"
```

The final listing must show every file above as `disabled_manually` and `Copera CI` as `active`. A workflow added by a sync may not be listed until GitHub has seen it on a pushed branch; if its first run starts before it can be disabled, cancel it with `gh run cancel <run-id> --repo "$REPO"` and disable it then.

## Activating Copera CI

The workflow file is kept at `copera/ci/copera-ci.yml`, outside `.github/workflows/`, because the credential that first published this branch had no `workflow` scope and GitHub refuses pushes that add workflow files without it. Until it is moved, no Copera CI runs and references in this document to `.github/workflows/copera-ci.yml` mean this file.

To activate it, from a checkout whose GitHub credential has the `workflow` scope (`gh auth refresh -h github.com -s workflow`):

```sh
git mv copera/ci/copera-ci.yml .github/workflows/copera-ci.yml
git commit -m "ci(copera): activate Copera CI workflow"
git push
```

The first run has never been observed. Expect to adjust it.
