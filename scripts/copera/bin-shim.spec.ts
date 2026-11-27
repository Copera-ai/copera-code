import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { satisfies } from 'semver'
import { describe, expect, it } from 'vitest'

const SHIM = join(import.meta.dirname, 'bin-shim.mjs')
const ROOT_MANIFEST = join(import.meta.dirname, '../../package.json')

/**
 * Run the shim as if Node.js reported `version`; the preload replaces `process.versions` before the shim runs.
 * @param version - Node.js version the shim sees.
 * @returns Exit status and standard error.
 */
function runAs(version: string): { status: number | null; stderr: string } {
  const preload = `data:text/javascript,Object.defineProperty(process,"versions",{value:{...process.versions,node:${JSON.stringify(version)}}})`
  const result = spawnSync(process.execPath, ['--import', preload, SHIM, '--version'], { encoding: 'utf8' })
  return { status: result.status, stderr: result.stderr }
}

describe('copera-code bin Node.js check', () => {
  const engines = (JSON.parse(readFileSync(ROOT_MANIFEST, 'utf8')) as { engines: { node: string } }).engines.node

  it('names the engines.node range of the package', () => {
    expect(readFileSync(SHIM, 'utf8')).toContain(`var REQUIRED_NODE = '${engines}'`)
  })

  it('loads every module dynamically, after the check', () => {
    const source = readFileSync(SHIM, 'utf8')
    expect(source).not.toMatch(/^\s*import\s/mu)
    expect(source).not.toMatch(/^\s*(?:const|let)\s/mu)
    expect(source).not.toMatch(/^await\s/mu)
  })

  it.each(['18.20.0', '22.12.0', '24.22.2', '25.9.0', '26.13.0', '24.22.3', '24.23.0', '26.13.1', '27.0.0'])('agrees with engines.node for Node.js %s', (version) => {
    const { status, stderr } = runAs(version)
    const refused = stderr.includes('is required')
    expect(refused).toBe(!satisfies(version, engines))
    if (refused) {
      expect(status).toBe(1)
      expect(stderr).toBe(`copera-code: Node.js ${engines} is required; this is Node.js ${version}.\n`)
    }
  })
})
