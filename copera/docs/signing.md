# Desktop packaging and signing (Copera Code)

This page covers building the Copera Code Desktop app on macOS and Windows, unsigned for local testing and signed for distribution. Every variable name below was checked against `apps/desktop/scripts/product-identity.mjs`, `electron-builder-config.mjs`, `desktop-package-environment.mjs`, `desktop-release-environment.mjs`, `windows-sign.mjs`, `package-macos.ts`, and `package-target.ts`. The upstream references are [Desktop packaging](../../apps/desktop/packaging/README.md) and [Windows signing and runner operations](../../apps/desktop/windows-signing/README.md); where they name DeepSeek Harness values, the Copera Code values on this page apply.

## Desktop identity

The identity is fixed in `apps/desktop/scripts/product-identity.mjs`; packaging scripts and the Electron main process read it from there.

| Value | Copera Code |
|---|---|
| Product name (application, installer, executable, `.app`) | `Copera Code` |
| Application ID (`appId`, macOS bundle ID, Windows AppUserModelID) | `ai.copera.code` |
| URL scheme | `copera-code` (registered by electron-builder in `Info.plist` and by the app at runtime; the Windows uninstaller removes `HKCU\Software\Classes\copera-code`) |
| Artifact names | `copera-code-<version>-mac-<arch>.dmg` / `.zip`, `copera-code-<version>-win-x64.exe`; unsigned builds add `-unsigned`, unnotarized ones `-unnotarized` |
| Packaged manifest name | `copera-code` (electron-builder updater cache `copera-code-updater`) |
| Electron user data | `~/Library/Application Support/copera-code` (macOS), `%APPDATA%\copera-code` (Windows); Electron derives it from the packaged manifest name. Crash reports go to `~/Library/Logs/Copera Code` (macOS) |
| Copera Code data home | `~/.copera-code`, or `COPERA_CODE_HOME`; an inherited `DSH_HOME` is ignored. `COPERA_CODE_HOME` takes effect only when the app is launched from a terminal: a Dock, Finder, or Start-menu launch resolves the data home from the session environment before the login-shell read, and the home cannot move once paths are resolved. `COPERA_CODE_TOKEN` and `COPERA_CODE_API_ORIGIN` from the login shell are applied to the Host for every launch. |
| Windows publisher and macOS company in package metadata | `Copera` |

`DSH_DESKTOP_APP_ID` is optional. Leave it unset; it exists only to give a test install its own reverse-DNS identity. The URL scheme needs no entitlement or signing change: it is an `Info.plist` entry, and sign-in does not use it (the OAuth redirect returns to the Host's loopback server at `http://127.0.0.1:<port>/oauth/callback`).

## Auto-update is off

`DSH_DESKTOP_UPDATES` switches the upstream auto-update path. It is a packaging setting read from `.env.macos` / `.env.windows` (never from the shell), `off` when unset.

With `off`:

- No `app-update.yml` is written into the app, electron-builder `publish` is empty, and no `nightly*.yml` channel file is produced.
- Neither signed nor unsigned builds require `DSH_DESKTOP_AUTO_UPDATE_ENV`, `DSH_DESKTOP_MANDATORY_UPDATE_*`, or `DOWNLOAD_*` settings, on macOS or Windows.
- No mandatory-update policy is embedded, and signed builds write no update release record (`<target>-release.json`).
- The packaged manifest records `dshDesktopUpdates: "off"`; the app then shows no "Check for Updates" menu item and runs no update or policy check.

`DSH_DESKTOP_UPDATES=on` restores the upstream behaviour, including all of its required settings. The upstream update feed is DeepSeek's (`download.deepseek.com` in production), so `on` is not usable for Copera Code without new publication infrastructure.

On Windows, signed builds still derive the installer's `publisherName` from the signing certificate (`CN`, `O`, `C`); with updates off it has no effect at runtime.

## What the package contains

The packaged runtime is the `@deepseek-ai/dsh` CLI and the private Desktop Host, with the Desktop profile composed from the `copera` profile bundles (`dsh-base`, `dsh-web-app`, `dsh-copera-app`). The Web client is built with the `copera` client build profile. Computer Use is not shipped: its five packages are left out of the runtime package set and pnpm overrides remove `dsh-cua-bundle` and `dsh-cua-mcp`. A signed macOS build therefore needs no notarized Computer Use helper. The Claude Code and Codex subagent bridges are on-demand plugins and are not in the package either.

The native DeepSeek welcome window never opens; the app starts in the main window, where the Copera sign-in overlay handles sign-in and opens the system browser. The "Manage dsh Command" menu item is not offered in v1, so the Desktop installs no terminal command; use the npm `copera-code` command instead.

## Before any build

Both platforms build from a full clone of `Copera-ai/copera-code` on branch `master`:

```sh
git clone https://github.com/Copera-ai/copera-code.git
cd copera-code
git checkout master
corepack enable            # provides pnpm 11.28.5 from package.json "packageManager"
node --version             # must satisfy ^24.22.3 || >=26.13.1
pnpm install --frozen-lockfile
```

Packaging runs its own complete build (`pnpm run build --profile copera`), so no separate build step is needed. It downloads Electron, Node runtime assets, and npm packages; it needs access to npmjs.org, GitHub release assets, and nodejs.org.

`package-target.ts` packages only for the host it runs on: macOS targets need a macOS host (`mac-arm64` needs Apple Silicon; `mac-x64` needs Intel or Apple Silicon with Rosetta), and `win-x64` needs Windows on x64. Linux is not a Desktop target.

Validate configuration and tools without building, signing, or contacting Apple by adding `--check`, for example `pnpm run package:desktop:mac:arm64:unsigned --check`.

## Unsigned build on a Mac

Requirements: macOS on Apple Silicon, Xcode Command Line Tools (`xcode-select --install`), Node and pnpm as above. No `.env.macos`, Apple account, or certificate is needed; unsigned macOS packaging ignores `.env.macos` and every inherited release variable.

```sh
pnpm run package:desktop:mac:arm64:unsigned
```

For an Intel Mac use `pnpm run package:desktop:mac:x64:unsigned`. Add `--dir` to stop at the unpacked application.

The command ends by printing `DMG:` and the absolute path:

- DMG: `apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/copera-code-<version>-mac-arm64-unsigned.dmg`
- Application: `apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/mac-arm64/Copera Code.app`
- Stage logs: `apps/desktop/.desktop-build/packaging-runs/<run>/events.jsonl`

Electron carries an ad-hoc signature, so the app runs on the machine that built it. To open it:

1. Open the DMG and drag `Copera Code` to `/Applications` (or any folder).
2. Open it. A copy built on the same Mac usually opens directly. A copy that arrived from another machine (download, AirDrop, chat) carries the quarantine flag, and macOS refuses it with "Copera Code cannot be opened" or "is damaged".
3. In that case open System Settings → Privacy & Security, scroll to the message about Copera Code, click Open Anyway, and confirm with your password. On macOS 15 and later, right-click → Open no longer bypasses Gatekeeper.
4. Alternatively remove the quarantine flag in Terminal: `xattr -dr com.apple.quarantine "/Applications/Copera Code.app"`.

## Unsigned build on Windows x64

Requirements: Windows on x64, Node and pnpm as above, Git, PowerShell 7 (`pwsh`) on `PATH`, `tar`, Python (set `PYTHON` when it is not on `PATH`), and the Visual Studio C++ Build Tools with a Windows SDK. The toolchain preflight checks them.

Unlike macOS, every Windows build reads `apps/desktop/.env.windows`. The template works unchanged for an unsigned build:

```powershell
Copy-Item apps/desktop/.env.windows.example apps/desktop/.env.windows
pnpm run package:desktop:win:x64:unsigned
```

Output:

- Installer: `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/copera-code-<version>-win-x64-unsigned.exe`
- Unpacked application: `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/win-unpacked/Copera Code.exe`
- Stage logs: `apps/desktop/.desktop-build/packaging-runs/<run>/events.jsonl`

Run the installer. SmartScreen shows "Windows protected your PC" for an unsigned installer: click More info, then Run anyway. The installer is per-user (no administrator rights) and installs under `%LOCALAPPDATA%\Programs\Copera Code` by default.

## Signing happens during packaging

There is no separate step that signs an existing build. `pnpm run package:desktop:<target>` prepares the runtime, signs every embedded binary, runs electron-builder, signs the application and installer, notarizes on macOS, and runs smoke checks, in one command:

| Target | Command | Required host |
|---|---|---|
| macOS Apple Silicon | `pnpm run package:desktop:mac:arm64` | macOS on Apple Silicon |
| macOS Intel | `pnpm run package:desktop:mac:x64` | macOS on Intel, or Apple Silicon with Rosetta |
| Windows x64 | `pnpm run package:desktop:win:x64` | Windows on x64 |

Signed output goes to `apps/desktop/.desktop-build/targets/<target>/artifacts/`. macOS produces `copera-code-<version>-mac-<arch>.dmg`, `.zip`, and `.zip.blockmap`; Windows produces `copera-code-<version>-win-x64.exe`.

## Where the settings come from

Release settings are never read from the shell environment: `desktop-package-environment.mjs` drops ambient `DSH_DESKTOP_*` release settings (including `DSH_DESKTOP_UPDATES` and `DSH_DESKTOP_APP_ID`), `APPLE_*`, `CSC_*`, and `WIN_CSC_*`. They come from one of two places:

- **Dotenv file (default):** `apps/desktop/.env.macos` or `apps/desktop/.env.windows`, copied from [`.env.macos.example`](../../apps/desktop/.env.macos.example) or [`.env.windows.example`](../../apps/desktop/.env.windows.example). Git ignores both files. Values are UTF-8, not shell-expanded, and relative paths resolve from `apps/desktop`. Quote values containing `#` or spaces. A name the template does not list stops packaging.
- **Machine preset:** set `DSH_PACKAGING_CONFIG_DIR` to an absolute directory and `DSH_PACKAGING_PRESET` to `test` or `production`. Public settings come from `<dir>/presets/<preset>.env`, which must set `DSH_DESKTOP_AUTO_UPDATE_ENV` to the preset name; signed builds add `<dir>/secrets/macos-signing.env` or `<dir>/secrets/windows-signing.env`. With a preset, a missing file fails the build; there is no fallback to the dotenv file.

Validate the configuration without signing, unlocking a token, or contacting Apple:

```sh
pnpm --dir apps/desktop run check:package
```

## macOS

Requirements:

- An Apple Developer Program membership and a **Developer ID Application** certificate with its private key, exported as a local `.p12` file.
- Xcode Command Line Tools on the signing Mac (`codesign`, `notarytool`).
- Credentials for Apple's notary service.

| Variable | Rule |
|---|---|
| `DSH_DESKTOP_MACOS_SIGNING_IDENTITY` | Certificate name without the `Developer ID Application:` prefix, for example `Example Company (TEAMID1234)`. |
| `DSH_DESKTOP_MACOS_TEAM_ID` | Apple Team ID: 10 uppercase letters or digits. |
| `CSC_LINK` | Path to the local `.p12`. URLs and Base64 values are rejected. |
| `CSC_KEY_PASSWORD` | The `.p12` export password, not an Apple account password. Must be present; an explicit empty value means an unencrypted `.p12`. |

Notarization takes exactly one of three credential sets; leave the others unset:

| Strategy | Variables |
|---|---|
| App Store Connect API key | `APPLE_API_KEY` (path to a readable `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |
| Apple ID | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Keychain profile | `APPLE_KEYCHAIN_PROFILE`, optional `APPLE_KEYCHAIN` (path to a readable keychain) |

Packaging creates a private temporary keychain, imports the `.p12`, signs a probe, uses that keychain for all signing, and deletes it afterwards; the login keychain needs no setup. Optional tuning variables are `DSH_DESKTOP_MACOS_SIGNATURE_CACHE_DIR`, `DSH_DESKTOP_MACOS_PACK_CONCURRENCY`, `DSH_DESKTOP_MACOS_ZIP_COMPRESSION_LEVEL`, `DSH_DESKTOP_MACOS_DOWNLOAD_PROXY`, and `DSH_DESKTOP_MACOS_NOTARIZATION_PROXY`. `package-target.ts` also accepts `--skip-notarization` for a signed macOS build without notarization; such a build is not distributable.

Check a signed application separately (needs the two `DSH_DESKTOP_MACOS_*` identity variables):

```sh
pnpm --dir apps/desktop run verify:mac-signature -- "apps/desktop/.desktop-build/targets/mac-arm64/artifacts/mac-arm64/Copera Code.app"
```

## Windows

Requirements:

- A Windows x64 machine (see the host table above) with PowerShell 7 (`pwsh`) on `PATH` and the Visual Studio C++ build tools, which the toolchain preflight checks.
- An EV code-signing certificate on a SafeNet USB hardware token, the SafeNet client software, and a SafeNet-compatible `signtool.exe`. The private key never leaves the token.

| Variable | Rule |
|---|---|
| `DSH_DESKTOP_WINDOWS_CER_FILE` | Public leaf certificate file: a non-CA Code Signing certificate whose `CN`, `O`, and `C` are each present and single-valued (the installer's `publisherName` is derived from them). |
| `DSH_DESKTOP_WINDOWS_SIGNTOOL` | Path to the SafeNet-compatible `signtool.exe`. |
| `DSH_DESKTOP_WINDOWS_KEY_CONTAINER` | SafeNet private-key container name; no quotes or line breaks. |
| `DSH_DESKTOP_WINDOWS_TOKEN_PIN` | SafeNet Token Password; no `]`, quotes, or line breaks. Stored in plaintext in the settings file, so restrict that file's access. |

Optional tuning variables are `DSH_DESKTOP_WINDOWS_SIGNATURE_CACHE_DIR`, `DSH_DESKTOP_WINDOWS_SIGNATURE_CACHE_CONCURRENCY`, `DSH_DESKTOP_WINDOWS_PACK_CONCURRENCY`, and `DSH_DESKTOP_WINDOWS_COMPRESSION_LEVEL`. `DSH_DESKTOP_WINDOWS_SIGN_TARGET`, `DSH_DESKTOP_WINDOWS_SIGN_APPEND`, and `DSH_DESKTOP_PACKAGING_RUN_DIR` are set by the packaging scripts for the signing process; do not set them. Signing is SHA-256 with a timestamp, serial on the token, and stops on the first failure. The token must be attached and unlocked by the person running the command for the whole run.

## Open decisions

- Signing machines for macOS and Windows are not assigned; the holder of the Copera signing keys runs the first signed release from [release-signing-handoff.md](release-signing-handoff.md). The upstream packaging workflows are disabled in the fork (see [upstream-sync.md](upstream-sync.md#upstream-workflows-in-the-fork)) and Copera Code has no packaging workflow of its own; builds run by hand on the machines above.
- The `Copera` publisher name in package metadata stands in until the legal entity name for installers is confirmed.
