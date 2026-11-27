/**
 * `pnpm copera-code [options]`: run the Copera Code launcher from source.
 *
 * The launcher and the dsh CLI it starts are TypeScript, so this script re-runs itself under tsx's ESM hook, the
 * same source launch `pnpm start:web` uses, and then calls the launcher with the user's arguments.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const TSX_IMPORT = ['--import', 'tsx/esm']

if (process.execArgv.join(' ').includes(TSX_IMPORT.join(' '))) {
  const { runCoperaCode } = await import('../../packages/util/copera-launch/src/index.ts')
  const { version } = JSON.parse(readFileSync(new URL('npm-package.template.json', import.meta.url), 'utf8'))
  await runCoperaCode({ productVersion: version })
} else {
  // The child runs in its own process group, so Ctrl+C reaches it once, through this forwarder.
  const child = spawn(process.execPath, [...TSX_IMPORT, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  })
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { child.kill(signal) })
  child.on('exit', (code, signal) => { process.exit(signal === null ? code ?? 1 : 1) })
}
