import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import { createLaunchEnvironmentSnapshot, DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import CoperaAccount, { type CoperaAccountState } from '../src/index.ts'
import { GRANT_KEY, GrantStore } from '../src/grant-store.ts'
import { startFakeCopera } from './fake-copera.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  while (cleanups.length > 0) await cleanups.pop()?.()
})

async function fixture(options: { envToken?: string; launch?: { process: Record<string, string>; project: Record<string, string> } } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-copera-account-'))
  cleanups.push(() => rm(home, { recursive: true, force: true }))
  const server = await startFakeCopera()
  cleanups.push(() => server.close())
  vi.stubEnv('DSH_COPERA_API_ORIGIN', server.origin)
  vi.stubEnv('DSH_COPERA_TOKEN', options.envToken)
  const ctx = new Context()
  if (options.launch !== undefined) {
    ctx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot([
      { source: 'process', values: { DSH_COPERA_API_ORIGIN: server.origin, ...options.launch.process } },
      { source: 'project-env', path: join(home, '.env'), values: options.launch.project },
    ]))
  }
  const web = ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await web
  const credentials = ctx.plugin(LocalCredentialProvider, { path: join(home, 'credentials.yaml'), watch: false })
  await credentials
  const account = ctx.plugin(CoperaAccount)
  await account
  cleanups.push(async () => { await account.dispose(); await credentials.dispose(); await web.dispose() })
  const callbackOrigin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  const states = new AbortController()
  cleanups.push(async () => { states.abort() })
  const service = ctx.coperaAccount
  const until = async (predicate: (state: CoperaAccountState) => boolean): Promise<CoperaAccountState> => {
    for await (const state of service.watch(states.signal)) if (predicate(state)) return state
    throw new Error('stream ended')
  }
  const store = new GrantStore(ctx, server.origin)
  return { ctx, server, service, callbackOrigin, until, store, account }
}

function callbackUrl(state: CoperaAccountState, query: string): string {
  const authorize = new URL(state.attempt?.authorizeUrl ?? '')
  const redirect = authorize.searchParams.get('redirect_uri') ?? ''
  return `${redirect}?${query}&state=${authorize.searchParams.get('state') ?? ''}`
}

it('starts signed out', async () => {
  const f = await fixture()
  expect(await f.service.getState()).toEqual({ status: 'signed-out', via: null, profile: null, attempt: null, notice: null })
})

it.each([
  'http://localhost:3080', 'http://127.0.0.1', 'https://127.0.0.1:3080', 'http://127.0.0.1:3080/path', 'http://10.0.0.1:3080',
  'http://user@127.0.0.1:3080', 'http://127.0.0.1:0', 'not a url',
])('refuses the callback origin %s', async (origin) => {
  const f = await fixture()
  await expect(f.service.startSignIn(origin, 'web')).rejects.toThrow()
  expect((await f.service.getState()).attempt).toBeNull()
})

it('signs in through the browser callback and stores the grant', async () => {
  const f = await fixture()
  const started = await f.service.startSignIn(f.callbackOrigin, 'web')
  expect(started.attempt?.phase).toBe('awaiting-browser')
  expect(started.attempt?.expiresAt).toBeGreaterThan(Date.now() + 590_000)
  const authorize = new URL(started.attempt?.authorizeUrl ?? '')
  expect(authorize.origin).toBe(f.server.origin)
  expect(authorize.searchParams.get('redirect_uri')).toBe(`${f.callbackOrigin}/oauth/callback`)
  // A joining caller receives the same attempt.
  expect((await f.service.startSignIn(f.callbackOrigin, 'desktop')).attempt?.authorizeUrl).toBe(started.attempt?.authorizeUrl)

  const response = await fetch(callbackUrl(started, 'code=the-code'))
  expect(response.status).toBe(200)
  const exchange = f.server.requests.find(r => r.form.get('grant_type') === 'authorization_code')
  expect(exchange?.form.get('redirect_uri')).toBe(`${f.callbackOrigin}/oauth/callback`)
  expect(exchange?.form.get('code')).toBe('the-code')
  expect(await f.service.getState()).toEqual({
    status: 'signed-in', via: 'oauth', attempt: null, notice: null,
    profile: { name: 'Test User', email: 'user@example.invalid', workspaceName: 'Test Workspace' },
  })
  expect((await fetch(callbackUrl(started, 'code=the-code'))).status).toBe(410)
  expect(f.server.count('authorization_code')).toBe(1)
  expect(await f.ctx.coperaTokens.getAccessToken()).toBe('access-1')
})

it('keeps waiting after a callback with the wrong state', async () => {
  const f = await fixture()
  const started = await f.service.startSignIn(f.callbackOrigin, 'web')
  const wrong = callbackUrl(started, 'code=c').replace(/state=[^&]*$/, 'state=wrong')
  expect((await fetch(wrong)).status).toBe(400)
  expect((await f.service.getState()).attempt?.phase).toBe('awaiting-browser')
  expect(f.server.count('authorization_code')).toBe(0)
})

it('ends the attempt as denied when the user declines consent', async () => {
  const f = await fixture()
  const started = await f.service.startSignIn(f.callbackOrigin, 'web')
  expect((await fetch(callbackUrl(started, 'error=access_denied'))).status).toBe(200)
  const state = await f.service.getState()
  expect(state.status).toBe('signed-out')
  expect(state.attempt?.phase).toBe('denied')
  expect(f.server.count('authorization_code')).toBe(0)
  // Retrying starts a new attempt.
  const retry = await f.service.startSignIn(f.callbackOrigin, 'web')
  expect(retry.attempt?.phase).toBe('awaiting-browser')
  expect(retry.attempt?.authorizeUrl).not.toBe(started.attempt?.authorizeUrl)
})

it('ends the attempt as failed when the code exchange fails', async () => {
  const f = await fixture()
  f.server.override((_form, res) => { res.writeHead(400).end(); return true })
  const started = await f.service.startSignIn(f.callbackOrigin, 'web')
  expect((await fetch(callbackUrl(started, 'code=c'))).status).toBe(200)
  const state = await f.service.getState()
  expect(state.status).toBe('signed-out')
  expect(state.attempt?.phase).toBe('failed')
})

it('expires an attempt after 600 seconds', async () => {
  const f = await fixture()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const started = await f.service.startSignIn(f.callbackOrigin, 'web')
  await vi.advanceTimersByTimeAsync(599_000)
  expect((await f.service.getState()).attempt?.phase).toBe('awaiting-browser')
  await vi.advanceTimersByTimeAsync(1_000)
  const state = await f.service.getState()
  expect(state.status).toBe('signed-out')
  expect(state.attempt?.phase).toBe('expired')
  vi.useRealTimers()
  expect((await fetch(callbackUrl(started, 'code=c'))).status).toBe(410)
  expect(f.server.count('authorization_code')).toBe(0)
})

it('cancels the attempt and refuses its late callback', async () => {
  const f = await fixture()
  const started = await f.service.startSignIn(f.callbackOrigin, 'web')
  await f.service.cancelSignIn()
  expect((await f.service.getState()).attempt).toBeNull()
  expect((await fetch(callbackUrl(started, 'code=c'))).status).toBe(410)
})

it('signs out locally first, then revokes the refresh and access tokens', async () => {
  const f = await fixture()
  await f.store.write({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresAt: Date.now() + 3_600_000, account: null })
  expect((await f.service.getState()).status).toBe('signed-in')
  f.server.revokeStatus(503)
  await f.service.signOut()
  expect(await f.ctx.credentials.readRecord(GRANT_KEY)).toBeUndefined()
  expect(await f.service.getState()).toEqual({ status: 'signed-out', via: null, profile: null, attempt: null, notice: null })
  // The first revocations fail; the background retries succeed.
  await vi.waitFor(() => { expect(f.server.revoked().length).toBeGreaterThanOrEqual(2) })
  f.server.revokeStatus(200)
  await vi.waitFor(() => {
    const revoked = f.server.revoked()
    expect(revoked.filter(t => t === 'refresh-0').length).toBeGreaterThanOrEqual(2)
    expect(revoked.filter(t => t === 'access-0').length).toBeGreaterThanOrEqual(2)
  }, { timeout: 5_000 })
})

it('reports an expired session and signs out when Copera revokes the refresh token', async () => {
  const f = await fixture()
  await f.store.write({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresAt: Date.now() - 1_000, account: null })
  // refresh-0 is not live on the fake, so the refresh answers 400.
  expect(await f.ctx.coperaTokens.getAccessToken()).toBeUndefined()
  const state = await f.until(s => s.notice === 'session-expired')
  expect(state.status).toBe('signed-out')
  expect(await f.ctx.credentials.readRecord(GRANT_KEY)).toBeUndefined()
  // A new attempt clears the notice.
  expect((await f.service.startSignIn(f.callbackOrigin, 'web')).notice).toBeNull()
})

it('replaces a rejected OAuth token through one refresh', async () => {
  const f = await fixture()
  f.server.liveRefreshTokens.add('refresh-0')
  await f.store.write({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresAt: Date.now() + 3_600_000, account: null })
  expect(await f.ctx.coperaTokens.getAccessToken()).toBe('access-0')
  const [a, b] = await Promise.all([f.ctx.coperaTokens.onRejected('access-0'), f.ctx.coperaTokens.onRejected('access-0')])
  expect([a, b]).toEqual(['access-1', 'access-1'])
  expect(f.server.count('refresh_token')).toBe(1)
})

it('uses the environment token without a grant and never refreshes it', async () => {
  const f = await fixture({ envToken: 'env-token-value' })
  expect(await f.ctx.coperaTokens.getAccessToken()).toBe('env-token-value')
  expect(await f.service.getState()).toEqual({ status: 'signed-in', via: 'env-token', profile: null, attempt: null, notice: null })
  expect(await f.ctx.coperaTokens.onRejected('env-token-value')).toBeUndefined()
  expect(f.server.requests).toHaveLength(0)
})

it('reads the token from the launch snapshot\'s process layer and never from a project .env file', async () => {
  const launched = await fixture({ launch: { process: { DSH_COPERA_TOKEN: 'launch-token' }, project: { DSH_COPERA_TOKEN: 'project-token' } } })
  expect(await launched.ctx.coperaTokens.getAccessToken()).toBe('launch-token')
  const projectOnly = await fixture({ launch: { process: {}, project: { DSH_COPERA_TOKEN: 'project-token' } } })
  expect(await projectOnly.ctx.coperaTokens.getAccessToken()).toBeUndefined()
  expect((await projectOnly.service.getState()).status).toBe('signed-out')
})

it('prefers the OAuth grant over the environment token', async () => {
  const f = await fixture({ envToken: 'env-token-value' })
  await f.store.write({ accessToken: 'access-0', refreshToken: 'refresh-0', expiresAt: Date.now() + 3_600_000, account: null })
  expect(await f.ctx.coperaTokens.getAccessToken()).toBe('access-0')
  expect((await f.service.getState()).via).toBe('oauth')
})

it('streams state changes starting with the current state', async () => {
  const f = await fixture()
  const signal = new AbortController()
  const seen: CoperaAccountState[] = []
  const reading = (async () => {
    for await (const state of f.service.watch(signal.signal)) {
      seen.push(state)
      if (state.attempt?.phase === 'awaiting-browser') signal.abort()
    }
  })()
  await vi.waitFor(() => { expect(seen.length).toBeGreaterThanOrEqual(1) })
  await f.service.startSignIn(f.callbackOrigin, 'web')
  await reading
  expect(seen[0]?.attempt).toBeNull()
  expect(seen.at(-1)?.attempt?.phase).toBe('awaiting-browser')
})

it('removes the callback listener and provided token source on disposal', async () => {
  const f = await fixture()
  const started = await f.service.startSignIn(f.callbackOrigin, 'web')
  await f.account.dispose()
  expect(f.ctx.get('coperaTokens')).toBeUndefined()
  expect((await fetch(callbackUrl(started, 'code=c'))).status).not.toBe(200)
  expect(f.server.count('authorization_code')).toBe(0)
})
