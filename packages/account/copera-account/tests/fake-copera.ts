/** Local stand-in for the Copera OAuth endpoints; refresh tokens rotate and a reused one revokes the whole login. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

/** One request the fake received. */
export interface FakeRequest {
  readonly method: string
  readonly path: string
  readonly contentType: string | undefined
  readonly form: URLSearchParams
}

/** Override for one `/oauth/token` request; return undefined to use the default rotation behaviour. */
export type TokenOverride = (form: URLSearchParams, res: ServerResponse) => Promise<boolean> | boolean

/** Running fake with its request log and controls. */
export interface FakeCopera {
  readonly origin: string
  readonly requests: FakeRequest[]
  /** Requests to `/oauth/token` with the given grant type. */
  count(grantType: string): number
  /** Revoke requests in arrival order. */
  revoked(): string[]
  /** Replace or clear the token override. */
  override(handler: TokenOverride | undefined): void
  /** Status for `/oauth/revoke`; defaults to 200. */
  revokeStatus(status: number): void
  /** Valid refresh tokens the fake will accept. */
  readonly liveRefreshTokens: Set<string>
  /** Include the account object in token responses. */
  withAccount(value: boolean): void
  close(): Promise<void>
}

/**
 * Start the fake on an ephemeral loopback port.
 * @returns the running fake.
 */
export async function startFakeCopera(): Promise<FakeCopera> {
  const requests: FakeRequest[] = []
  const live = new Set<string>()
  let issued = 0
  let override: TokenOverride | undefined
  let revokeStatus = 200
  let account = true
  const issue = (res: ServerResponse): void => {
    issued++
    const refresh = `refresh-${issued}`
    live.add(refresh)
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      access_token: `access-${issued}`, refresh_token: refresh, expires_in: 3600, token_type: 'Bearer', scope: 'access_shikai',
      ...account ? { account: { name: 'Test User', email: 'user@example.invalid', workspace_name: 'Test Workspace' } } : {},
    }))
  }
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    req.setEncoding('utf8')
    let text = ''
    for await (const chunk of req) text += String(chunk)
    const form = new URLSearchParams(text)
    const path = new URL(req.url ?? '/', 'http://fake.invalid').pathname
    requests.push({ method: req.method ?? '', path, contentType: req.headers['content-type'], form })
    if (path === '/oauth/revoke') { res.writeHead(revokeStatus).end(); return }
    if (path !== '/oauth/token' || req.method !== 'POST') { res.writeHead(404).end(); return }
    if (override !== undefined && await override(form, res)) return
    const grantType = form.get('grant_type')
    if (grantType === 'authorization_code') { issue(res); return }
    if (grantType === 'refresh_token') {
      const presented = form.get('refresh_token') ?? ''
      if (!live.has(presented)) {
        // Reuse of a rotated token revokes every token of the login.
        live.clear()
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'invalid grant' }))
        return
      }
      live.delete(presented)
      issue(res)
      return
    }
    res.writeHead(400).end()
  }
  const server = createServer((req, res) => { void handle(req, res).catch(() => { res.writeHead(500).end() }) })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing listener')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    count: grantType => requests.filter(r => r.path === '/oauth/token' && r.form.get('grant_type') === grantType).length,
    revoked: () => requests.filter(r => r.path === '/oauth/revoke').map(r => r.form.get('token') ?? ''),
    override: (handler) => { override = handler },
    revokeStatus: (status) => { revokeStatus = status },
    liveRefreshTokens: live,
    withAccount: (value) => { account = value },
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve() }); server.closeAllConnections() }),
  }
}
