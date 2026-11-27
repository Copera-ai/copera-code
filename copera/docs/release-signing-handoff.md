# Signing handoff (Copera Code)

This page is a task brief for the person who holds the Copera signing keys (the Apple **Account Holder** of the Copera LLC team, and the holder of the Windows EV token) and for the coding agent working with them. It says what to build, how to sign it, how to check it, and what to hand back. The reference for every variable and command is [signing.md](signing.md); this page does not repeat it, and where the two disagree, signing.md wins.

## Where things stand

- Branch: `master` on `Copera-ai/copera-code`. Build from its tip.
- **macOS:** validated end to end on an Apple Silicon Mac with an unsigned build (macOS 27, Node 24.22.3, pnpm 11.28.5): the unsigned package builds, `pack-npm` and `verify-pack` pass, browser OAuth sign-in works, a real access-token refresh after one hour works without a new sign-in, the revoked token is refused by the API, `~/.dsh` is untouched, and the app only talks to `127.0.0.1` and `api.copera.ai` / `app.copera.ai`. Gates passed: `typecheck`, `lint`, Copera package specs, `apps/desktop/tests`, `build:desktop`, `check:i18n`, `doc-sync`. Signing and notarization were **not** run: no Developer ID Application certificate with a private key was available.
- **Windows:** **never packaged or run.** The only test machine was Windows on ARM, and `package-target.ts` refuses non-x64 hosts. Your Windows run is the first one, so it also has to do the smoke checks below.

## Your tasks

1. Signed, notarized macOS Apple Silicon build (`mac-arm64`). Build `mac-x64` too only if the release owner asks for Intel support.
2. Signed Windows x64 installer (`win-x64`), plus the Windows smoke checks.
3. Hand back the artifacts and a short report (see [Hand back](#hand-back)).

Do not change application code to get a build through. If a check fails, stop and report it with the log path; fixes go through a pull request into `master`.

## Setup on both machines

Follow [Before any build](signing.md#before-any-build): clone, `git checkout master`, `corepack enable`, `pnpm install --frozen-lockfile`. Record the commit you build (`git rev-parse HEAD`).

Settings go in `apps/desktop/.env.macos` or `apps/desktop/.env.windows`, copied from the `.example` next to them. Git ignores both files. Settings are never read from the shell environment.

## macOS (signed and notarized)

**Certificate.** A **Developer ID Application** certificate of the Copera LLC team with its private key, exported as a local `.p12`. The team already has two of them (they expire 2027-02-01). Use one whose private key you still hold, or create a new one; only the Account Holder can. The "Developer ID Application Managed" (cloud) certificates do not work: packaging signs every embedded binary with `codesign` and needs a local key.

**Notarization.** Pick exactly one credential set (see the table in [signing.md → macOS](signing.md#macos)). An App Store Connect API key, or a `notarytool` keychain profile stored with `xcrun notarytool store-credentials <profile> --apple-id <apple-id> --team-id <team-id>`. Check that the profile works with `xcrun notarytool history --keychain-profile <profile>`.

**Settings** in `apps/desktop/.env.macos`:

| Variable | Value |
|---|---|
| `DSH_DESKTOP_MACOS_SIGNING_IDENTITY` | `Copera LLC (<team-id>)`, the certificate name without the `Developer ID Application:` prefix |
| `DSH_DESKTOP_MACOS_TEAM_ID` | the Copera LLC team ID |
| `CSC_LINK` | local path to the `.p12` |
| `CSC_KEY_PASSWORD` | the `.p12` export password |
| `APPLE_KEYCHAIN_PROFILE` (or the API-key or Apple ID set) | the notarization credential |

Leave `DSH_DESKTOP_UPDATES` unset (auto-update stays off) and `DSH_DESKTOP_APP_ID` unset.

**Build:**

```sh
pnpm --dir apps/desktop run check:package          # validates settings; no signing, no Apple contact
pnpm run package:desktop:mac:arm64 --check          # tool and config preflight
pnpm run package:desktop:mac:arm64
```

Output: `apps/desktop/.desktop-build/targets/mac-arm64/artifacts/` (`copera-code-<version>-mac-arm64.dmg`, `.zip`, `.zip.blockmap`).

**Verify:**

```sh
APP="apps/desktop/.desktop-build/targets/mac-arm64/artifacts/mac-arm64/Copera Code.app"
DMG=$(ls apps/desktop/.desktop-build/targets/mac-arm64/artifacts/copera-code-*-mac-arm64.dmg)
pnpm --dir apps/desktop run verify:mac-signature -- "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dvv "$APP" 2>&1 | grep -E 'Authority=Developer ID Application|TeamIdentifier|Runtime'
spctl -a -t exec -vv "$APP"                         # expect: accepted, source=Notarized Developer ID
xcrun stapler validate "$DMG"
spctl -a -t open --context context:primary-signature -vv "$DMG"
shasum -a 256 "$DMG"
```

Then copy the DMG to another Mac (or download it, so it carries the quarantine flag), install it, and open it. It must open **without** the "Open Anyway" step. Sign in with Copera and send one message.

## Windows (signed)

**Host:** Windows on **x64** (ARM is refused). Requirements: PowerShell 7 (`pwsh`), Git, Python, `tar`, Visual Studio C++ Build Tools with a Windows SDK, the SafeNet client, and a SafeNet-compatible `signtool.exe`. Keep the EV token attached and unlocked for the whole run.

**Settings** in `apps/desktop/.env.windows` (see [signing.md → Windows](signing.md#windows)): `DSH_DESKTOP_WINDOWS_CER_FILE`, `DSH_DESKTOP_WINDOWS_SIGNTOOL`, `DSH_DESKTOP_WINDOWS_KEY_CONTAINER`, `DSH_DESKTOP_WINDOWS_TOKEN_PIN`. The PIN is stored in plaintext, so restrict the file's access and delete it after the build if the machine is shared.

**Build:**

```powershell
pnpm --dir apps/desktop run check:package
pnpm run package:desktop:win:x64 --check
pnpm run package:desktop:win:x64
```

Output: `apps/desktop/.desktop-build/targets/win-x64/artifacts/copera-code-<version>-win-x64.exe`.

**Verify the signature:**

```powershell
$exe = Get-ChildItem apps/desktop/.desktop-build/targets/win-x64/artifacts/copera-code-*-win-x64.exe
& "<signtool.exe path from DSH_DESKTOP_WINDOWS_SIGNTOOL>" verify /pa /v $exe.FullName
Get-AuthenticodeSignature $exe.FullName | Format-List Status, SignerCertificate, TimeStamperCertificate
Get-FileHash -Algorithm SHA256 $exe.FullName
```

`Status` must be `Valid` and a timestamp must be present. The installer's publisher must show the certificate's organization.

**Smoke checks (first Windows run).** Install the signed installer as a normal user and record pass or fail for each line:

| # | Check | Expected |
|---|---|---|
| W1 | SmartScreen | A signed EV installer normally opens with no "Windows protected your PC" prompt. If the prompt appears, note it; reputation can lag on a new certificate |
| W2 | Installer | Copera branding and "Copera Code" texts; per-user install, no administrator prompt, default folder `%LOCALAPPDATA%\Programs\Copera Code` |
| W3 | Start menu and icons | "Copera Code" shortcut; exe, taskbar and tray icons are Copera's; tray tooltip and menu say Copera Code |
| W4 | First launch | Opens the main window with the Copera sign-in; no DeepSeek welcome window |
| W5 | Sign-in and chat | Browser OAuth sign-in completes; data home is `%USERPROFILE%\.copera-code`; a chat message gets a reply |
| W6 | URL scheme | `reg query HKCU\Software\Classes\copera-code` exists after first launch; `start copera-code://open` focuses the app |
| W7 | No updater, no CLI | No "Check for Updates" or "Manage dsh Command…" menu items; no `copera-code` on the user `PATH`; no `resources\runtime\cli` folder; `resources` contains `LICENSE`, `THIRD_PARTY_NOTICES.md` and `OFL-Inter.txt` |
| W8 | Language, theme, close | Switching language and light/dark theme works; record what closing the window does (tray or exit); no text says "DeepSeek Harness" |
| W9 | Electron data folder | Record the real folder; expected `%APPDATA%\copera-code`. If it differs, report it so signing.md can be corrected |
| W10 | Uninstall | Settings → Apps → Copera Code → Uninstall. Then `HKCU\Software\Classes\copera-code` is gone, `%USERPROFILE%\.copera-code` **remains**, and `%USERPROFILE%\.dsh` is untouched. Record which Electron folders were removed |
| W11 | Network | While signed in, the app's connections (`Get-NetTCPConnection -OwningProcess <pid>`) go only to loopback and to `api.copera.ai` / `app.copera.ai` |
| W12 | Product lock | Put a `cordis.patch.yml` in `%USERPROFILE%\.copera-code` that enables a forbidden row, for example `llm-pi-ai`. The app must refuse to start, and the dialog must show `Copera Code product lock: …`. Delete the file afterwards; create it only if it did not exist. If the packaging smoke test itself refuses with a product-lock error, that is a false positive: report it |

## Rules

- Never commit `.env.macos`, `.env.windows`, `.p12`, `.cer`, `.p8` or any password or PIN. Never paste them into chat, issues or logs.
- Do not run `npm publish`. Do not turn on auto-update.
- Do not commit or push without the release owner's go-ahead. If you change a file that came from upstream DeepSeek Harness, add a `COPERA:` marker and a line in [upstream-edits.md](upstream-edits.md).
- Test against production (`api.copera.ai`) with your own Copera account.

## Hand back

Send to the release owner:

- the built commit SHA;
- the artifacts (`.dmg`, `.zip`, `.exe`) with their SHA-256;
- the output of the verify commands above, with no secrets;
- the W1–W12 table filled in;
- any failure, with its stage log `apps/desktop/.desktop-build/packaging-runs/<run>/events.jsonl`.
