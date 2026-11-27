/** Copera Code Desktop identity and the auto-update switch across the packaging configuration. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESKTOP_UPDATES_DEFAULT, desktopUpdatesEnabled, productIdentity } from '../scripts/product-identity.mjs'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { de, en, es, fr, ja, pt, ru, zh } from '../src/locale.ts'
import {
  loadDesktopPackageEnvironment, localMacOSPackageEnvironment, validateDesktopPackageEnvironment,
} from '../scripts/desktop-package-environment.mjs'

const MAC_SIGNING = { DSH_DESKTOP_MACOS_SIGNING_IDENTITY: 'Example Company (TEAMID1234)', DSH_DESKTOP_MACOS_TEAM_ID: 'TEAMID1234' }

async function withDirectory(action: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'copera-identity-'))
  try { await action(directory) } finally { await rm(directory, { recursive: true, force: true }) }
}

describe('Copera Code Desktop identity', () => {
  it('declares the fixed product identity', () => {
    expect(productIdentity).toEqual({
      productName: 'Copera Code', appId: 'ai.copera.code', protocolScheme: 'copera-code', protocolName: 'Copera Code',
      artifactPrefix: 'copera-code', packageName: 'copera-code', homeDirName: '.copera-code', cliCommandName: 'copera-code',
    })
  })

  it.each([['darwin', 'arm64'], ['win32', 'x64']] as const)('names the %s package from the product identity', (platform, arch) => {
    const config = createElectronBuilderConfig({
      DSH_DESKTOP_TARGET_PLATFORM: platform, DSH_DESKTOP_TARGET_ARCH: arch, DSH_DESKTOP_UNSIGNED: '1',
    }, platform, arch)
    expect(config.productName).toBe(productIdentity.productName)
    expect(config.appId).toBe(productIdentity.appId)
    expect(config.protocols).toEqual([{ name: productIdentity.protocolName, schemes: [productIdentity.protocolScheme] }])
    expect(config.artifactName).toBe(`${productIdentity.artifactPrefix}-\${version}-\${os}-\${arch}-unsigned.\${ext}`)
    expect(config.extraMetadata).toMatchObject({ name: productIdentity.packageName, dshDesktopAppId: productIdentity.appId })
    expect(config.copyright).toBe(`Copyright © ${new Date().getFullYear()} \${productName}`)
    expect(JSON.stringify(config.mac.extendInfo)).not.toContain('DeepSeek')
  })

  it.each([['darwin', 'arm64'], ['win32', 'x64']] as const)('ships the licence, the notices, and the Inter licence on %s', (platform, arch) => {
    const config = createElectronBuilderConfig({
      DSH_DESKTOP_TARGET_PLATFORM: platform, DSH_DESKTOP_TARGET_ARCH: arch, DSH_DESKTOP_UNSIGNED: '1',
    }, platform, arch)
    const resources: ReadonlyArray<{ readonly from: string; readonly to: string }> = config.extraResources
    for (const to of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'OFL-Inter.txt']) {
      const resource = resources.find(entry => entry.to === to)
      expect(resource, to).toBeDefined()
      expect(statSync(resource!.from).isFile(), to).toBe(true)
    }
    const inter = readFileSync(resources.find(entry => entry.to === 'OFL-Inter.txt')!.from, 'utf8')
    expect(inter.startsWith('Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)\n')).toBe(true)
  })

  it.each(Object.entries({ en, zh, ja, es, fr, de, ru, pt }))('names Copera Code in the %s address-in-use dialog', (_locale, messages) => {
    expect(messages.startupAddressInUse).toContain(productIdentity.productName)
    expect(messages.startupAddressInUse).not.toMatch(/\bDSH\b|\bdsh\b/u)
  })

  it('gives unsigned local macOS packaging the product application ID', () => {
    expect(localMacOSPackageEnvironment({ DSH_DESKTOP_APP_ID: 'com.example.other', PATH: '/bin' }))
      .toMatchObject({ DSH_DESKTOP_APP_ID: productIdentity.appId, DSH_DESKTOP_UNSIGNED: '1', PATH: '/bin' })
  })

  it('keeps every product-identity string out of the Desktop shell, scripts, launchers, and installer sources', () => {
    const root = new URL('..', import.meta.url)
    const offending: string[] = []
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry)
        if (statSync(path).isDirectory()) { visit(path); continue }
        if (/\.(?:png|ico|icns|bmp|woff2?)$/u.test(entry)) continue
        const text = readFileSync(path, 'utf8')
        for (const pattern of ['DeepSeek Harness', 'DeepSeekHarness', 'com.deepseek.harness', '/usr/local/bin/dsh', 'deepseek-harness-']) {
          if (text.includes(pattern)) offending.push(`${join(directory, entry).slice(root.pathname.length)}: ${pattern}`)
        }
      }
    }
    for (const directory of ['scripts', 'src', 'cli', 'installer']) visit(join(root.pathname, directory))
    expect(offending).toEqual([])
  })

  it('spells the identity where a file cannot import product-identity.mjs', () => {
    const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    expect(read('scripts/macos-notarization-proxy.ts')).toContain(`'Library', 'Caches', '${productIdentity.appId}'`)
    expect(read('installer/uninstall.nsh')).toContain(`"Software\\Classes\\${productIdentity.protocolScheme}"`)
    expect(read('cli/dsh')).toContain(`/MacOS/${productIdentity.productName}"`)
    expect(read('cli/dsh.cmd')).toContain(`\\${productIdentity.productName}.exe"`)
    expect(read('scripts/uninstall-registration.ps1')).toContain(`'${productIdentity.productName}.exe'`)
  })

  it('uses one command-registration mutex and owner key in the installer worker and the uninstaller', () => {
    const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    const mutexes = (text: string): string[] => [...text.matchAll(/'(Global\\[^']+\.)'\s*\+\s*\$sid/gu)].map(match => match[1]!)
    const worker = mutexes(read('scripts/command-path.ps1'))
    const uninstaller = mutexes(read('scripts/uninstall-registration.ps1'))
    expect(worker).toEqual(['Global\\CoperaCode.Command.'])
    expect(uninstaller).toEqual(worker)
    expect(read('scripts/command-path.ps1')).toContain('-OwnerKey \'Software\\CoperaCode\\Command\'')
    expect(read('installer/uninstall.nsh')).toContain('"Software\\CoperaCode\\Command"')
  })
})

describe('Desktop auto-update switch', () => {
  it('is off by default and accepts only on or off', () => {
    expect(DESKTOP_UPDATES_DEFAULT).toBe('off')
    expect(desktopUpdatesEnabled({})).toBe(false)
    expect(desktopUpdatesEnabled({ DSH_DESKTOP_UPDATES: '' })).toBe(false)
    expect(desktopUpdatesEnabled({ DSH_DESKTOP_UPDATES: 'on' })).toBe(true)
    expect(() => desktopUpdatesEnabled({ DSH_DESKTOP_UPDATES: 'yes' })).toThrow('DSH_DESKTOP_UPDATES must be on or off')
  })

  it.each([['darwin', 'arm64', '1'], ['darwin', 'arm64', '0'], ['win32', 'x64', '1']] as const)(
    'omits the update feed and policy on %s (unsigned=%s) without requiring their settings', (platform, arch, unsigned) => {
      const config = createElectronBuilderConfig({
        ...MAC_SIGNING, APPLE_KEYCHAIN_PROFILE: 'release',
        DSH_DESKTOP_TARGET_PLATFORM: platform, DSH_DESKTOP_TARGET_ARCH: arch, DSH_DESKTOP_UNSIGNED: unsigned,
      }, platform, arch)
      expect(config.publish).toBeNull()
      expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
      expect(config.extraMetadata).toMatchObject({ dshDesktopUpdates: 'off' })
    })

  it('keeps the upstream feed and policy requirements behind DSH_DESKTOP_UPDATES=on', () => {
    const env = { DSH_DESKTOP_UPDATES: 'on', DSH_DESKTOP_TARGET_PLATFORM: 'win32', DSH_DESKTOP_TARGET_ARCH: 'x64', DSH_DESKTOP_UNSIGNED: '1' }
    expect(() => createElectronBuilderConfig(env, 'win32', 'x64')).toThrow('DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN')
    const config = createElectronBuilderConfig({ ...env, DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }) }, 'win32', 'x64')
    expect(config.extraMetadata).toMatchObject({ dshDesktopUpdates: 'on', dshMandatoryUpdatePolicy: { origin: 'https://policy.example.com' } })
  })

  it.each([
    [{ platform: 'win32', arch: 'x64' }, { unsigned: true }],
    [{ platform: 'win32', arch: 'x64' }, { prepareOnly: true }],
    [{ platform: 'darwin', arch: 'arm64' }, { unsigned: true }],
  ] as const)('validates %j %j without an update feed or policy origin', (target, options) => {
    expect(() => { validateDesktopPackageEnvironment({}, target, options) }).not.toThrow()
  })

  it('validates a signed macOS build without update feed or policy settings', async () => {
    await withDirectory(async (directory) => {
      const p12 = join(directory, 'signing.p12')
      await writeFile(p12, 'certificate')
      const signed = { ...MAC_SIGNING, APPLE_KEYCHAIN_PROFILE: 'release', CSC_LINK: p12, CSC_KEY_PASSWORD: '' }
      expect(() => { validateDesktopPackageEnvironment(signed, { platform: 'darwin', arch: 'arm64' }) }).not.toThrow()
      expect(() => { validateDesktopPackageEnvironment({ ...signed, DSH_DESKTOP_UPDATES: 'on' }, { platform: 'darwin', arch: 'arm64' }) })
        .toThrow('DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN')
    })
  })

  it('accepts the shipped settings templates, and the Windows template unchanged for an unsigned build', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, '.env.windows'), readFileSync(new URL('../.env.windows.example', import.meta.url)))
      await writeFile(join(directory, '.env.macos'), readFileSync(new URL('../.env.macos.example', import.meta.url)))
      const windows = loadDesktopPackageEnvironment('win32', {}, directory, { unsigned: true })
      expect(windows.DSH_DESKTOP_UPDATES).toBe('off')
      expect(() => { validateDesktopPackageEnvironment(windows, { platform: 'win32', arch: 'x64' }, { unsigned: true }) }).not.toThrow()
      expect(() => { validateDesktopPackageEnvironment(windows, { platform: 'win32', arch: 'x64' }) }).toThrow('DSH_DESKTOP_WINDOWS_CER_FILE')
      const mac = loadDesktopPackageEnvironment('darwin', {}, directory)
      expect(mac.DSH_DESKTOP_UPDATES).toBe('off')
      expect(() => { validateDesktopPackageEnvironment(mac, { platform: 'darwin', arch: 'arm64' }) }).toThrow('DSH_DESKTOP_MACOS_SIGNING_IDENTITY')
    })
  })

  it('reads the switch from the packaging settings file and ignores the shell environment', async () => {
    await withDirectory(async (directory) => {
      await writeFile(join(directory, '.env.windows'), 'DSH_DESKTOP_UPDATES=on\n')
      expect(loadDesktopPackageEnvironment('win32', { DSH_DESKTOP_UPDATES: 'off' }, directory).DSH_DESKTOP_UPDATES).toBe('on')
      await writeFile(join(directory, '.env.macos'), '\n')
      expect(loadDesktopPackageEnvironment('darwin', { DSH_DESKTOP_UPDATES: 'on' }, directory)).not.toHaveProperty('DSH_DESKTOP_UPDATES')
    })
  })
})
