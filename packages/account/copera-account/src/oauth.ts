/**
 * Copera OAuth 2.1 authorization-code + PKCE protocol for the first-party `copera-code` client. Pure HTTP helpers
 * without Cordis; callers own storage, serialization, and the origin check.
 * @module
 */
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'

/** First-party client identifier registered by Copera. */
export const CLIENT_ID = 'copera-code'
/** Scope that admits the token on the Shikai routes. */
export const SCOPE = 'access_shikai'
/** Path of the browser callback on the loopback origin. */
export const CALLBACK_PATH = '/oauth/callback'

/** Deadline for an authorization-code exchange or a revocation request. */
const REQUEST_TIMEOUT_MS = 30_000

/** Stored and returned token set of one Copera sign-in. */
export interface CoperaGrant {
  /** Bearer token for Shikai requests. */
  readonly accessToken: string
  /** Rotating refresh token; Copera revokes the whole login when a rotated one is presented again. */
  readonly refreshToken: string
  /** Epoch milliseconds at which the access token expires. */
  readonly expiresAt: number
  /** Profile Copera sent with the token response, or null when it sent none. */
  readonly account: { readonly name: string; readonly email: string; readonly workspaceName: string } | null
}

/** Copera rejected the refresh token (HTTP 400 or 401); the grant can never be refreshed again. */
export class GrantRevokedError extends Error {
  override readonly name = 'GrantRevokedError'
  /** Creates the error with a fixed message that carries no token. */
  constructor() { super('Copera rejected the refresh token') }
}

/** A Copera OAuth request failed without proving the grant revoked: HTTP status, transport, timeout, or response fields. */
export class CoperaOAuthError extends Error {
  override readonly name = 'CoperaOAuthError'
  /**
   * @param operation - request that failed.
   * @param reason - HTTP status or failure class; never a token or response body.
   * @param options - underlying cause for diagnostics.
   */
  constructor(readonly operation: 'exchange' | 'refresh' | 'revoke', readonly reason: string, options?: ErrorOptions) {
    super(`Copera OAuth ${operation} failed: ${reason}`, options)
  }
}

const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  token_type: z.string().regex(/^bearer$/i),
  scope: z.string().optional(),
  account: z.object({ name: z.string(), email: z.string(), workspace_name: z.string() }).nullish(),
})

/**
 * Create a fresh PKCE verifier and its S256 challenge.
 * @returns a 43-character base64url verifier and its SHA-256 challenge.
 */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

/**
 * Build the Copera authorization page URL for one attempt.
 * @param i - API origin, loopback redirect URI, CSRF state, and PKCE challenge.
 * @returns the absolute `/oauth/authorize` URL requesting the Shikai resource.
 */
export function buildAuthorizeUrl(i: { origin: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL('/oauth/authorize', i.origin)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: i.redirectUri,
    state: i.state,
    code_challenge: i.challenge,
    code_challenge_method: 'S256',
    resource: `${new URL(i.origin).origin}/shikai`,
    scope: SCOPE,
  }).toString()
  return url.href
}

/**
 * Exchange an authorization code for a grant.
 * @param i - API origin, the code from the callback, the attempt's PKCE verifier, and the same redirect URI.
 * @returns the validated grant.
 * @throws CoperaOAuthError on any HTTP, transport, timeout, or response-field failure.
 */
export async function exchangeCode(
  i: { origin: string; code: string; verifier: string; redirectUri: string; signal?: AbortSignal },
): Promise<CoperaGrant> {
  const response = await post('exchange', i.origin, '/oauth/token', {
    grant_type: 'authorization_code', code: i.code, redirect_uri: i.redirectUri, code_verifier: i.verifier, client_id: CLIENT_ID,
  }, REQUEST_TIMEOUT_MS, i.signal)
  if (!response.ok) throw new CoperaOAuthError('exchange', `HTTP ${String(response.status)}`)
  return parseGrant('exchange', response)
}

/**
 * Redeem a refresh token. Copera rotates refresh tokens, so the caller must persist the result before any other
 * refresh uses the same token.
 * @param i - API origin, the stored refresh token, and the request deadline.
 * @returns the replacement grant.
 * @throws GrantRevokedError on HTTP 400 or 401; CoperaOAuthError on any other failure, including timeout.
 */
export async function refreshGrant(
  i: { origin: string; refreshToken: string; timeoutMs: number; signal?: AbortSignal },
): Promise<CoperaGrant> {
  const response = await post('refresh', i.origin, '/oauth/token', {
    grant_type: 'refresh_token', refresh_token: i.refreshToken, client_id: CLIENT_ID,
  }, i.timeoutMs, i.signal)
  // Copera's token endpoint does not use RFC 6749 error bodies; the status alone decides revocation.
  if (response.status === 400 || response.status === 401) {
    await response.body?.cancel()
    throw new GrantRevokedError()
  }
  if (!response.ok) throw new CoperaOAuthError('refresh', `HTTP ${String(response.status)}`)
  return parseGrant('refresh', response)
}

/**
 * Ask Copera to revoke one access or refresh token.
 * @param i - API origin and the token to revoke.
 * @returns after Copera answers with a 2xx status.
 * @throws CoperaOAuthError on any HTTP, transport, or timeout failure.
 */
export async function revokeToken(i: { origin: string; token: string; signal?: AbortSignal }): Promise<void> {
  const response = await post('revoke', i.origin, '/oauth/revoke', { token: i.token }, REQUEST_TIMEOUT_MS, i.signal)
  await response.body?.cancel()
  if (!response.ok) throw new CoperaOAuthError('revoke', `HTTP ${String(response.status)}`)
}

async function post(operation: CoperaOAuthError['operation'], origin: string, path: string, form: Record<string, string>,
  timeoutMs: number, signal: AbortSignal | undefined): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs)
  try {
    return await fetch(new URL(path, origin), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
      // Credentials in the body must never follow a redirect to another endpoint.
      redirect: 'error',
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
    })
  } catch (error) {
    throw new CoperaOAuthError(operation, timeout.aborted ? 'timeout' : 'network', { cause: error })
  }
}

async function parseGrant(operation: 'exchange' | 'refresh', response: Response): Promise<CoperaGrant> {
  let body: unknown
  try { body = await response.json() } catch (error) { throw new CoperaOAuthError(operation, 'invalid JSON', { cause: error }) }
  const parsed = tokenResponse.safeParse(body)
  if (!parsed.success) throw new CoperaOAuthError(operation, 'invalid token response')
  const { account } = parsed.data
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    expiresAt: Date.now() + parsed.data.expires_in * 1000,
    account: account == null ? null : { name: account.name, email: account.email, workspaceName: account.workspace_name },
  }
}
