import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import { GRANT_KEY, GrantStore } from '../src/grant-store.ts'
import type { CoperaGrant } from '../src/oauth.ts'
import { startFakeCopera, type FakeCopera } from './fake-copera.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => { while (cleanups.length > 0) await cleanups.pop()?.() })

/** One simulated process: its own Context and credentials provider over the shared file. */
async function processOn(file: string, origin: string, options: { refreshTimeoutMs?: number; onRevoked?: () => void } = {}) {
  const ctx = new Context()
  const fiber = ctx.plugin(LocalCredentialProvider, { path: file, watch: false })
  await fiber
  cleanups.push(() => fiber.dispose())
  const provider = ctx.credentials
  return { ctx, provider, store: new GrantStore(ctx, origin, options) }
}

async function fixture(options: { refreshTimeoutMs?: number } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-copera-grant-'))
  cleanups.push(() => rm(home, { recursive: true, force: true }))
  const server: FakeCopera = await startFakeCopera()
  cleanups.push(() => server.close())
  const file = join(home, 'credentials.yaml')
  const onRevoked = vi.fn()
  const main = await processOn(file, server.origin, { ...options, onRevoked })
  return { server, file, onRevoked, ...main }
}

function grant(index: string, expiresAt: number): CoperaGrant {
  return { accessToken: `access-${index}`, refreshToken: `refresh-${index}`, expiresAt, account: null }
}

const expired = (): number => Date.now() - 1_000
const fresh = (): number => Date.now() + 3_600_000

it('round-trips a grant and ignores a grant issued by another origin', async () => {
  const f = await fixture()
  await f.store.write(grant('0', fresh()))
  expect(await f.store.read()).toEqual(grant('0', (await f.store.read())?.expiresAt ?? 0))
  const other = new GrantStore(f.ctx, 'https://other.example.invalid')
  expect(await other.read()).toBeNull()
})

it('returns a fresh grant without contacting the server', async () => {
  const f = await fixture()
  await f.store.write(grant('0', fresh()))
  expect((await f.store.refreshIfNeeded({ skewMs: 60_000 }))?.accessToken).toBe('access-0')
  expect(f.server.requests).toHaveLength(0)
})

it('refreshes a grant inside the skew window', async () => {
  const f = await fixture()
  f.server.liveRefreshTokens.add('refresh-0')
  await f.store.write(grant('0', Date.now() + 30_000))
  expect((await f.store.refreshIfNeeded({ skewMs: 60_000 }))?.accessToken).toBe('access-1')
  expect((await f.store.read())?.refreshToken).toBe('refresh-1')
})

it('keeps the previous account when the refresh response has none', async () => {
  const f = await fixture()
  f.server.liveRefreshTokens.add('refresh-0')
  f.server.withAccount(false)
  const account = { name: 'N', email: 'e@example.invalid', workspaceName: 'W' }
  await f.store.write({ ...grant('0', expired()), account })
  expect((await f.store.refreshIfNeeded({ skewMs: 60_000 }))?.account).toEqual(account)
})

it('sends exactly one refresh for two simultaneous callers in one process', async () => {
  const f = await fixture()
  f.server.liveRefreshTokens.add('refresh-0')
  await f.store.write(grant('0', expired()))
  const [a, b] = await Promise.all([f.store.refreshIfNeeded({ skewMs: 60_000 }), f.store.refreshIfNeeded({ skewMs: 60_000 })])
  expect(f.server.count('refresh_token')).toBe(1)
  expect(a?.accessToken).toBe('access-1')
  expect(b?.accessToken).toBe('access-1')
})

it('sends exactly one refresh for simultaneous callers in two processes sharing the credentials file', async () => {
  const f = await fixture()
  f.server.liveRefreshTokens.add('refresh-0')
  await f.store.write(grant('0', expired()))
  // Both processes hold the same expired grant before either refreshes.
  const second = await processOn(f.file, f.server.origin)
  expect((await second.store.read())?.accessToken).toBe('access-0')
  const results = await Promise.all([
    f.store.refreshIfNeeded({ skewMs: 60_000 }), second.store.refreshIfNeeded({ skewMs: 60_000 }),
    f.store.refreshIfNeeded({ rejectedToken: 'access-0', skewMs: 60_000 }), second.store.refreshIfNeeded({ rejectedToken: 'access-0', skewMs: 60_000 }),
  ])
  expect(f.server.count('refresh_token')).toBe(1)
  expect(results.map(r => r?.accessToken)).toEqual(['access-1', 'access-1', 'access-1', 'access-1'])
  expect(f.onRevoked).not.toHaveBeenCalled()
})

it('returns the stored grant without a request when the rejected token was already replaced', async () => {
  const f = await fixture()
  await f.store.write(grant('5', fresh()))
  expect((await f.store.refreshIfNeeded({ rejectedToken: 'access-4', skewMs: 60_000 }))?.accessToken).toBe('access-5')
  expect(f.server.requests).toHaveLength(0)
})

it('refreshes an unexpired grant whose current access token was rejected', async () => {
  const f = await fixture()
  f.server.liveRefreshTokens.add('refresh-0')
  await f.store.write(grant('0', fresh()))
  expect((await f.store.refreshIfNeeded({ rejectedToken: 'access-0', skewMs: 60_000 }))?.accessToken).toBe('access-1')
  expect(f.server.count('refresh_token')).toBe(1)
})

it('returns null without a request when nothing is stored', async () => {
  const f = await fixture()
  expect(await f.store.refreshIfNeeded({ skewMs: 60_000 })).toBeNull()
  expect(f.server.requests).toHaveLength(0)
})

it('clears the record and reports revocation when Copera rejects the refresh token', async () => {
  const f = await fixture()
  await f.store.write(grant('0', expired()))
  // refresh-0 is not live on the fake, so it answers 400.
  expect(await f.store.refreshIfNeeded({ skewMs: 60_000 })).toBeNull()
  expect(await f.provider.readRecord(GRANT_KEY)).toBeUndefined()
  expect(f.onRevoked).toHaveBeenCalledOnce()
})

it('keeps a record whose refresh token changed after the revoked refresh', async () => {
  const f = await fixture()
  const second = await processOn(f.file, f.server.origin)
  await f.store.write(grant('0', expired()))
  const original = f.provider.modifyRecord.bind(f.provider)
  // Another process signs in again between the revoked refresh and the cleanup.
  vi.spyOn(f.provider, 'modifyRecord').mockImplementationOnce(async (key, mutate) => {
    const result = await original(key, mutate)
    await second.store.write(grant('9', fresh()))
    return result
  })
  expect((await f.store.refreshIfNeeded({ skewMs: 60_000 }))?.accessToken).toBe('access-9')
  expect((await f.store.read())?.refreshToken).toBe('refresh-9')
  expect(f.onRevoked).not.toHaveBeenCalled()
})

it('clears only a record that still holds the given refresh token', async () => {
  const f = await fixture()
  await f.store.write(grant('2', fresh()))
  expect(await f.store.clearIfRefreshTokenIs('refresh-1')).toBe(false)
  expect((await f.store.read())?.refreshToken).toBe('refresh-2')
  expect(await f.store.clearIfRefreshTokenIs('refresh-2')).toBe(true)
  expect(await f.store.read()).toBeNull()
})

it('keeps the record on a network error and retries on the next call', async () => {
  const f = await fixture()
  await f.store.write(grant('0', expired()))
  f.server.override((_form, res) => { res.socket?.destroy(); return true })
  await expect(f.store.refreshIfNeeded({ skewMs: 60_000 })).rejects.toThrow()
  expect((await f.store.read())?.refreshToken).toBe('refresh-0')
  f.server.override(undefined)
  f.server.liveRefreshTokens.add('refresh-0')
  expect((await f.store.refreshIfNeeded({ skewMs: 60_000 }))?.accessToken).toBe('access-1')
  expect(f.onRevoked).not.toHaveBeenCalled()
})

it('keeps the record when the refresh times out', async () => {
  const f = await fixture({ refreshTimeoutMs: 100 })
  await f.store.write(grant('0', expired()))
  f.server.override(() => new Promise<boolean>(() => undefined))
  await expect(f.store.refreshIfNeeded({ skewMs: 60_000 })).rejects.toThrow()
  expect((await f.store.read())?.refreshToken).toBe('refresh-0')
  expect(f.onRevoked).not.toHaveBeenCalled()
})

it('keeps the record on a server error', async () => {
  const f = await fixture()
  await f.store.write(grant('0', expired()))
  f.server.override((_form, res) => { res.writeHead(503).end(); return true })
  await expect(f.store.refreshIfNeeded({ skewMs: 60_000 })).rejects.toThrow()
  expect((await f.store.read())?.refreshToken).toBe('refresh-0')
})
