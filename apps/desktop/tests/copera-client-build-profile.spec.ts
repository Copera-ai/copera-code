/**
 * The Copera Code Desktop packaging stages accept the client build record that `pnpm run build --profile copera`
 * writes. Each case writes a real record over real artifacts and runs it through the exact check each packing stage
 * performs: `pack-local-packages.ts` for unsigned builds and the `dsh` release family for signed builds. The
 * upstream defaults (`local` unsigned, `official` signed) keep their behavior when invoked without a profile.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  repositoryClientBuildEnvironment,
  resolveClientBuildEnvironment,
  writeClientBuildRecord,
} from '../../../scripts/client-build-environment.ts'
import { releaseFamily } from '../../../scripts/release/families.ts'
import { parseReleasePackArguments } from '../../../scripts/release/pack.ts'
import { parseLocalPackArguments, verifyLocalPackBuild } from '../scripts/pack-local-packages.ts'
import { DESKTOP_CLIENT_BUILD_PROFILE } from '../scripts/package-target.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

/**
 * A committed checkout with one Web artifact and the client build record `scripts/build.ts` writes for `profile`.
 * @param profile - client build profile passed to the build.
 * @returns the checkout root.
 */
function builtCheckout(profile: string): string {
  const root = mkdtempSync(join(tmpdir(), 'copera-client-build-'))
  roots.push(root)
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '1.2.3' })}\n`)
  writeFileSync(join(root, '.gitignore'), '.dsh-build/\n')
  mkdirSync(join(root, 'apps/web/dist'), { recursive: true })
  writeFileSync(join(root, 'apps/web/dist/index.html'), '<title>Copera Code</title>\n')
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid',
    '-c', 'commit.gpgsign=false', ...args], { cwd: root, stdio: 'ignore' })
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'fixture')
  // The same two calls scripts/build.ts makes before it writes the record.
  const clean: NodeJS.ProcessEnv = {}
  writeClientBuildRecord(root, resolveClientBuildEnvironment(repositoryClientBuildEnvironment(root, clean), profile))
  return root
}

describe('Copera Code desktop packaging client build profile', () => {
  it('builds and packs with the copera profile', () => {
    expect(DESKTOP_CLIENT_BUILD_PROFILE).toBe('copera')
  })

  it('accepts a copera build record on the unsigned pack path', () => {
    const root = builtCheckout('copera')
    const { clientProfile } = parseLocalPackArguments(['--out', 'x', '--client-profile', DESKTOP_CLIENT_BUILD_PROFILE])
    expect(() => { verifyLocalPackBuild(root, clientProfile) }).not.toThrow()
  })

  it('accepts a copera build record on the signed release pack path', () => {
    const root = builtCheckout('copera')
    const { clientProfile } = parseReleasePackArguments(['--family', 'dsh', '--client-profile', DESKTOP_CLIENT_BUILD_PROFILE])
    expect(() => { releaseFamily('dsh').verifyBuildArtifacts(root, clientProfile) }).not.toThrow()
  })

  it('keeps the upstream unsigned default: local only', () => {
    expect(parseLocalPackArguments(['--out', 'x']).clientProfile).toBe('local')
    expect(() => { verifyLocalPackBuild(builtCheckout('local'), 'local') }).not.toThrow()
    expect(() => { verifyLocalPackBuild(builtCheckout('copera'), 'local') }).toThrow(/differs from the required artifact profile/u)
    expect(() => { verifyLocalPackBuild(builtCheckout('local'), 'copera') }).toThrow(/differs from the required artifact profile/u)
  })

  it('keeps the upstream signed default: official only', () => {
    expect(parseReleasePackArguments(['--family', 'dsh']).clientProfile).toBe('official')
    expect(() => { releaseFamily('dsh').verifyBuildArtifacts(builtCheckout('official'), 'official') }).not.toThrow()
    expect(() => { releaseFamily('dsh').verifyBuildArtifacts(builtCheckout('copera'), 'official') }).toThrow(/differs/u)
    expect(() => { releaseFamily('dsh').verifyBuildArtifacts(builtCheckout('official'), 'copera') }).toThrow(/differs/u)
  })

  it('refuses unknown profiles on both pack paths', () => {
    expect(() => { parseLocalPackArguments(['--out', 'x', '--client-profile', 'official']) }).toThrow(/local.*copera/u)
    expect(() => { parseReleasePackArguments(['--family', 'dsh', '--client-profile', 'local']) }).toThrow(/official.*copera/u)
  })
})
