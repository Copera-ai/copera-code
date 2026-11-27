/** Stage local-branded DSH packages for unsigned Desktop builds without a publication record. */

import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  coperaClientBuildEnvironment,
  readClientBuildRecord,
  repositoryClientBuildEnvironment,
  resolveClientBuildEnvironment,
} from '../../../scripts/client-build-environment.ts'
import { releaseFamily } from '../../../scripts/release/families.ts'
import { packFamilyMembers, parsePackConcurrency } from '../../../scripts/release/pack.ts'

// COPERA: `--client-profile copera` packs a Copera Code build; `local` stays the default.
/** Client build profiles an unsigned Desktop pack accepts. */
const LOCAL_PACK_CLIENT_PROFILES = ['local', 'copera'] as const

/** One of the client build profiles an unsigned Desktop pack accepts. */
export type LocalPackClientProfile = typeof LOCAL_PACK_CLIENT_PROFILES[number]

/** Parsed local pack command line. */
export interface LocalPackArguments {
  readonly out: string
  readonly concurrency: number
  readonly clientProfile: LocalPackClientProfile
}

/**
 * Parse the local pack command line.
 * @param argv - arguments after the script entry point.
 * @returns the staging directory, pack concurrency, and required client build profile.
 */
export function parseLocalPackArguments(argv: readonly string[]): LocalPackArguments {
  const { values } = parseArgs({
    args: [...argv],
    options: { out: { type: 'string' }, concurrency: { type: 'string' }, 'client-profile': { type: 'string' } },
    allowPositionals: false,
  })
  if (values.out === undefined) throw new Error('desktop local pack: --out must name the package staging directory')
  const requested = values['client-profile'] ?? 'local'
  const clientProfile = LOCAL_PACK_CLIENT_PROFILES.find(profile => profile === requested)
  if (clientProfile === undefined) {
    throw new Error(`desktop local pack: --client-profile must be one of ${LOCAL_PACK_CLIENT_PROFILES.join(', ')}; got ${JSON.stringify(requested)}`)
  }
  return { out: values.out, concurrency: parsePackConcurrency(values.concurrency), clientProfile }
}

/**
 * Require current client artifacts built with `clientProfile` before packing them.
 * @param root - repository root containing the build record and artifacts.
 * @param clientProfile - client build profile the artifacts must carry.
 */
export function verifyLocalPackBuild(root: string, clientProfile: LocalPackClientProfile): void {
  readClientBuildRecord(root, clientProfile === 'copera'
    ? coperaClientBuildEnvironment(root)
    : resolveClientBuildEnvironment(repositoryClientBuildEnvironment(root), 'local'))
}

async function main(): Promise<void> {
  const { out, concurrency, clientProfile } = parseLocalPackArguments(process.argv.slice(2))
  const root = process.cwd()
  verifyLocalPackBuild(root, clientProfile)
  const destination = resolve(root, out)
  const packed = await packFamilyMembers(root, releaseFamily('dsh'), destination, concurrency)
  console.log(`desktop local pack: ${String(packed.length)} tarball(s) in ${destination}`)
}

if (import.meta.main) await main()
