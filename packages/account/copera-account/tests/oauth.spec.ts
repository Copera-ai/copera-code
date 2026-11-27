import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { buildAuthorizeUrl, createPkce, exchangeCode, GrantRevokedError, refreshGrant, revokeToken } from '../src/oauth.ts'
import { startFakeCopera, type FakeCopera } from './fake-copera.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => { while (cleanups.length > 0) await cleanups.pop()?.() })

async function fake(): Promise<FakeCopera> {
  const server = await startFakeCopera()
  cleanups.push(() => server.close())
  return server
}

it('creates an S256 PKCE pair', () => {
  const { verifier, challenge } = createPkce()
  expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
  expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  expect(createPkce().verifier).not.toBe(verifier)
})

it('builds the authorize URL with the fixed Copera parameters', () => {
  const url = new URL(buildAuthorizeUrl({
    origin: 'https://api.copera.ai', redirectUri: 'http://127.0.0.1:3080/oauth/callback', state: 'st', challenge: 'ch',
  }))
  expect(url.origin + url.pathname).toBe('https://api.copera.ai/oauth/authorize')
  expect(Object.fromEntries(url.searchParams)).toEqual({
    response_type: 'code',
    client_id: 'copera-code',
    redirect_uri: 'http://127.0.0.1:3080/oauth/callback',
    state: 'st',
    code_challenge: 'ch',
    code_challenge_method: 'S256',
    resource: 'https://api.copera.ai/shikai',
    scope: 'access_shikai',
  })
})

it('exchanges the code with a form POST and maps the account', async () => {
  const server = await fake()
  const before = Date.now()
  const grant = await exchangeCode({ origin: server.origin, code: 'the-code', verifier: 'the-verifier', redirectUri: 'http://127.0.0.1:1/oauth/callback' })
  const [request] = server.requests
  expect(request?.method).toBe('POST')
  expect(request?.path).toBe('/oauth/token')
  expect(request?.contentType).toBe('application/x-www-form-urlencoded')
  expect(Object.fromEntries(request?.form ?? [])).toEqual({
    grant_type: 'authorization_code', code: 'the-code', code_verifier: 'the-verifier',
    redirect_uri: 'http://127.0.0.1:1/oauth/callback', client_id: 'copera-code',
  })
  expect(grant.accessToken).toBe('access-1')
  expect(grant.refreshToken).toBe('refresh-1')
  expect(grant.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000)
  expect(grant.account).toEqual({ name: 'Test User', email: 'user@example.invalid', workspaceName: 'Test Workspace' })
})

it('leaves the account null when the token response has none', async () => {
  const server = await fake()
  server.withAccount(false)
  const grant = await exchangeCode({ origin: server.origin, code: 'c', verifier: 'v', redirectUri: 'http://127.0.0.1:1/oauth/callback' })
  expect(grant.account).toBeNull()
})

it('rejects a token response without the required fields', async () => {
  const server = await fake()
  server.override((_form, res) => { res.writeHead(200, { 'content-type': 'application/json' }).end('{"access_token":"a"}'); return true })
  await expect(exchangeCode({ origin: server.origin, code: 'c', verifier: 'v', redirectUri: 'http://127.0.0.1:1/oauth/callback' }))
    .rejects.toThrow()
})

it('refreshes with the refresh token and client id', async () => {
  const server = await fake()
  server.liveRefreshTokens.add('r0')
  const grant = await refreshGrant({ origin: server.origin, refreshToken: 'r0', timeoutMs: 5_000 })
  expect(Object.fromEntries(server.requests[0]?.form ?? [])).toEqual({ grant_type: 'refresh_token', refresh_token: 'r0', client_id: 'copera-code' })
  expect(grant.refreshToken).toBe('refresh-1')
})

it.each([400, 401])('reports HTTP %i on refresh as a revoked grant', async (status) => {
  const server = await fake()
  server.override((_form, res) => { res.writeHead(status).end('{"message":"nope"}'); return true })
  await expect(refreshGrant({ origin: server.origin, refreshToken: 'r0', timeoutMs: 5_000 })).rejects.toBeInstanceOf(GrantRevokedError)
})

it('does not report server errors, timeouts, or network failures as a revoked grant', async () => {
  const server = await fake()
  server.override((_form, res) => { res.writeHead(500).end(); return true })
  const serverError = await refreshGrant({ origin: server.origin, refreshToken: 'r0', timeoutMs: 5_000 }).catch((error: unknown) => error)
  expect(serverError).toBeInstanceOf(Error)
  expect(serverError).not.toBeInstanceOf(GrantRevokedError)

  server.override(() => new Promise<boolean>(() => undefined))
  const timeout = await refreshGrant({ origin: server.origin, refreshToken: 'r0', timeoutMs: 50 }).catch((error: unknown) => error)
  expect(timeout).toBeInstanceOf(Error)
  expect(timeout).not.toBeInstanceOf(GrantRevokedError)

  const closed = server.origin
  await server.close()
  const network = await refreshGrant({ origin: closed, refreshToken: 'r0', timeoutMs: 5_000 }).catch((error: unknown) => error)
  expect(network).toBeInstanceOf(Error)
  expect(network).not.toBeInstanceOf(GrantRevokedError)
})

it('never follows a redirect from the token endpoint', async () => {
  const target = createServer((_req, res) => { res.writeHead(200).end('{}') })
  await new Promise<void>((resolve) => { target.listen(0, '127.0.0.1', resolve) })
  cleanups.push(() => new Promise((resolve) => { target.close(resolve) }))
  const server = await fake()
  server.override((_form, res) => { res.writeHead(307, { location: `http://127.0.0.1:${String((target.address() as { port: number }).port)}/` }).end(); return true })
  await expect(refreshGrant({ origin: server.origin, refreshToken: 'r0', timeoutMs: 5_000 })).rejects.not.toBeInstanceOf(GrantRevokedError)
})

it('revokes a token with a form POST', async () => {
  const server = await fake()
  await revokeToken({ origin: server.origin, token: 'tok' })
  expect(server.requests[0]?.path).toBe('/oauth/revoke')
  expect(server.requests[0]?.contentType).toBe('application/x-www-form-urlencoded')
  expect(server.revoked()).toEqual(['tok'])
  server.revokeStatus(503)
  await expect(revokeToken({ origin: server.origin, token: 'tok' })).rejects.toThrow()
})
