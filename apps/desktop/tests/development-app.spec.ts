/** Cold-start launcher preserves workspace paths without evaluating shell syntax. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { developmentHomeEnvironment, developmentLauncher } from '../scripts/development-app.ts'
import { applyDesktopProductEnvironment } from '../src/product-environment.ts'

it.skipIf(process.platform === 'win32')('passes literal workspace paths and cold-start settings to Electron', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-development-app-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const bundle = join(root, "Harness ' $(false).app")
  const binary = join(bundle, 'Contents', 'MacOS', 'Electron')
  mkdirSync(join(bundle, 'Contents', 'MacOS'), { recursive: true })
  // COPERA: the main process maps COPERA_CODE_HOME and discards DSH_HOME, so the launcher must export the former.
  writeFileSync(binary, '#!/bin/sh\nprintf "%s\\n" "$COPERA_CODE_HOME" "$DSH_DESKTOP_DEV_APP" "$DSH_DESKTOP_OPEN_DEVTOOLS" "$@"\n', { mode: 0o755 })
  const launcher = join(root, 'launcher')
  const home = join(root, "home ' $(false)")
  writeFileSync(launcher, developmentLauncher({ electron: binary, appRoot: root, directory: root,
    home, userData: join(root, 'browser data'), mainPort: 9229, rendererPort: 9222, hostPort: 9230, openDevtools: '0' }, bundle))
  const result = execFileSync('/bin/sh', [launcher, '--test-launch-argument'], { encoding: 'utf8' })
  expect(result.trimEnd().split('\n')).toEqual([home, '1', '0', '--inspect=127.0.0.1:9229',
    '--remote-debugging-port=9222', `--user-data-dir=${join(root, 'browser data')}`, root, '--test-launch-argument'])
})

// COPERA: `pnpm dev:desktop` and `start:desktop` must keep the isolated development home after the main process
// maps the product environment, which replaces any inherited DSH_HOME.
it('keeps the isolated development home through the product environment mapping', () => {
  const env: NodeJS.ProcessEnv = { DSH_HOME: '/inherited', ...developmentHomeEnvironment('/repo/.desktop-dev/home') }
  applyDesktopProductEnvironment(env, '/home/someone')
  expect(env.DSH_HOME).toBe('/repo/.desktop-dev/home')
})
