/**
 * Copera account service: browser sign-in with OAuth 2.1 authorization code + PKCE over the Host web server's loopback
 * callback, the stored grant, and the `coperaTokens` provider for the `copera` model route.
 * @module
 */
import { randomBytes } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-llm-copera'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { registerCallbackListener, type CallbackOutcome } from './callback.ts'
import { resolveApiOrigin, resolveCallbackOrigin } from './config.ts'
import { GRANT_KEY, GrantStore } from './grant-store.ts'
import { buildAuthorizeUrl, CALLBACK_PATH, CoperaOAuthError, createPkce, exchangeCode, revokeToken } from './oauth.ts'
import { AccountTokenSource } from './token-source.ts'
import type { CoperaAccountState, CoperaSignInAttempt } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { coperaAccount: CoperaAccount }
}

/** A sign-in attempt stops accepting its callback this long after it starts. */
const ATTEMPT_TIMEOUT_MS = 600_000
/** Delays before each background revocation retry after the first request fails. */
const REVOKE_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const

interface Attempt {
  phase: CoperaSignInAttempt['phase']
  readonly origin: string
  readonly loginSource: 'web' | 'desktop'
  readonly authorizeUrl: string
  readonly expiresAt: number
  readonly redirectUri: string
  readonly verifier: string
  /** Set once a callback was accepted; later callbacks answer 410. */
  consumed: boolean
  readonly controller: AbortController
  timer: ReturnType<typeof setTimeout> | undefined
}

/** Copera sign-in state and operations, exposed to Clients through the `coperaAccount` Remote namespace. */
export class CoperaAccount extends TypertRemoteService {
  static inject = ['credentials']
  private readonly origin: string
  private readonly store: GrantStore
  private attempt: Attempt | undefined
  private disposeCallback: (() => void) | undefined
  private notice: CoperaAccountState['notice'] = null
  private readonly listeners = new Set<() => void>()
  private readonly lifetime = new AbortController()
  private readonly revocations = new Set<Promise<void>>()
  private signingOut: Promise<void> | undefined

  /** @param ctx - Host Context with the `credentials` service; `webServer` must be running before sign-in starts. */
  constructor(ctx: Context) {
    super(ctx, 'coperaAccount')
    this.origin = resolveApiOrigin(process.env.DSH_COPERA_API_ORIGIN)
    this.store = new GrantStore(ctx, this.origin, {
      onRevoked: () => {
        this.notice = 'session-expired'
        this.changed()
      },
    })
    ctx.provide('coperaTokens', new AccountTokenSource(this.store, () => process.env.DSH_COPERA_TOKEN))
    ctx.on('credentials/record-updated', (key) => { if (key === GRANT_KEY) this.changed() })
    ctx.effect(() => async () => {
      this.lifetime.abort()
      if (this.attempt !== undefined) this.stop(this.attempt)
      this.disposeCallback?.()
      await Promise.all(this.revocations)
      this.changed()
    }, 'copera-account: attempt and revocation lifetime')
  }

  /**
   * Read the account state.
   * @returns status, credential source, profile, latest attempt, and notice; never a token.
   */
  @Remote
  async getState(): Promise<CoperaAccountState> {
    const grant = await this.store.read()
    const attempt = this.attempt === undefined ? null
      : { phase: this.attempt.phase, authorizeUrl: this.attempt.authorizeUrl, expiresAt: this.attempt.expiresAt }
    if (grant !== null) {
      return { status: 'signed-in', via: 'oauth', profile: grant.account === null ? null : { ...grant.account }, attempt, notice: this.notice }
    }
    const envToken = process.env.DSH_COPERA_TOKEN
    if (envToken !== undefined && envToken !== '') return { status: 'signed-in', via: 'env-token', profile: null, attempt, notice: this.notice }
    return { status: 'signed-out', via: null, profile: null, attempt, notice: this.notice }
  }

  /**
   * Stream the account state, starting with the current state, then once per change; coalesced changes yield the latest state.
   * @param signal - subscription lifetime; ending it never cancels a sign-in.
   * @returns complete states until the signal aborts or the service is disposed.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<CoperaAccountState> {
    let pending = true
    let wake: (() => void) | undefined
    const notify = (): void => {
      pending = true
      wake?.()
    }
    const stop = (): void => { wake?.() }
    this.listeners.add(notify)
    signal.addEventListener('abort', stop, { once: true })
    this.lifetime.signal.addEventListener('abort', stop, { once: true })
    try {
      while (!signal.aborted && !this.lifetime.signal.aborted) {
        if (pending) {
          pending = false
          const state = await this.getState()
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Abort or disposal can occur during the state read.
          if (signal.aborted || this.lifetime.signal.aborted) return
          yield state
          continue
        }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      this.listeners.delete(notify)
      signal.removeEventListener('abort', stop)
      this.lifetime.signal.removeEventListener('abort', stop)
    }
  }

  /**
   * Start a browser sign-in, or join the attempt already waiting on the same callback origin.
   * @param callbackOrigin - origin of the Host web server as the browser reaches it: `http://127.0.0.1:<port>` or
   * `http://[::1]:<port>`; `localhost` is refused.
   * @param loginSource - initiating UI; both receive the same browser pages.
   * @returns the state with the attempt's authorization URL, without waiting for the browser.
   * @throws CoperaOriginError for a refused callback origin; Error when the Host web server is not running.
   */
  @Remote
  async startSignIn(callbackOrigin: string, loginSource: 'web' | 'desktop'): Promise<CoperaAccountState> {
    const origin = resolveCallbackOrigin(callbackOrigin)
    if (this.lifetime.signal.aborted) throw new Error('copera-account is disposed')
    if (this.ctx.get('webServer') === undefined) throw new Error('copera-account: the Host web server is not running')
    if (this.signingOut !== undefined) await this.signingOut
    const current = this.attempt
    if (current?.phase === 'awaiting-browser' && !current.consumed && current.origin === origin) return this.getState()
    if (current !== undefined) this.stop(current)
    const { verifier, challenge } = createPkce()
    const state = randomBytes(32).toString('base64url')
    const redirectUri = `${origin}${CALLBACK_PATH}`
    const attempt: Attempt = {
      phase: 'awaiting-browser', origin, loginSource, redirectUri, verifier, consumed: false,
      authorizeUrl: buildAuthorizeUrl({ origin: this.origin, redirectUri, state, challenge }),
      expiresAt: Date.now() + ATTEMPT_TIMEOUT_MS, controller: new AbortController(), timer: undefined,
    }
    attempt.timer = setTimeout(() => { this.expire(attempt) }, ATTEMPT_TIMEOUT_MS)
    this.disposeCallback?.()
    this.disposeCallback = registerCallbackListener(this.ctx, {
      origin, state,
      accepting: () => this.attempt === attempt && attempt.phase === 'awaiting-browser' && !attempt.consumed,
      complete: outcome => this.complete(attempt, outcome),
    })
    this.attempt = attempt
    this.notice = null
    this.changed()
    return this.getState()
  }

  /**
   * Discard the current attempt; a pending code exchange is aborted and its late callback answers 410.
   * @returns after the attempt is removed from the state.
   */
  @Remote
  cancelSignIn(): Promise<void> {
    const attempt = this.attempt
    if (attempt !== undefined) {
      this.stop(attempt)
      this.attempt = undefined
      this.changed()
    }
    return Promise.resolve()
  }

  /**
   * Remove the stored grant, publish the signed-out state, then revoke its refresh and access tokens in the background
   * with retries. Remote revocation failures never restore the grant. The environment token is not affected.
   * @returns after the local removal and the state change.
   */
  @Remote
  signOut(): Promise<void> {
    this.signingOut ??= (async () => {
      await this.cancelSignIn()
      let removed: { accessToken: string; refreshToken: string } | undefined
      // A concurrent refresh can rotate the grant between the read and the conditional removal.
      for (let tries = 0; tries < 3 && removed === undefined; tries++) {
        const grant = await this.store.read()
        if (grant === null) break
        if (await this.store.clearIfRefreshTokenIs(grant.refreshToken)) removed = grant
      }
      this.notice = null
      this.changed()
      if (removed !== undefined) {
        this.revokeInBackground(removed.refreshToken)
        this.revokeInBackground(removed.accessToken)
      }
    })().finally(() => { this.signingOut = undefined })
    return this.signingOut
  }

  private async complete(attempt: Attempt, outcome: CallbackOutcome): Promise<'signed-in' | 'denied' | 'failed'> {
    attempt.consumed = true
    clearTimeout(attempt.timer)
    if (outcome.kind === 'error') {
      const phase = outcome.error === 'access_denied' ? 'denied' : 'failed'
      this.settle(attempt, phase)
      return phase
    }
    try {
      const grant = await exchangeCode({
        origin: this.origin, code: outcome.code, verifier: attempt.verifier, redirectUri: attempt.redirectUri,
        signal: attempt.controller.signal,
      })
      if (this.attempt !== attempt) return 'failed'
      await this.store.write(grant)
      this.attempt = undefined
      this.notice = null
      this.changed()
      return 'signed-in'
    } catch (error) {
      console.error('[copera-account] sign-in failed', { reason: error instanceof CoperaOAuthError ? error.reason : 'storage' })
      this.settle(attempt, 'failed')
      return 'failed'
    }
  }

  private expire(attempt: Attempt): void {
    if (this.attempt !== attempt || attempt.consumed || attempt.phase !== 'awaiting-browser') return
    this.settle(attempt, 'expired')
  }

  /** Move a still-current attempt to a terminal phase. */
  private settle(attempt: Attempt, phase: Exclude<CoperaSignInAttempt['phase'], 'awaiting-browser'>): void {
    if (this.attempt !== attempt) return
    attempt.phase = phase
    this.changed()
  }

  private stop(attempt: Attempt): void {
    clearTimeout(attempt.timer)
    attempt.controller.abort()
  }

  private revokeInBackground(token: string): void {
    const signal = this.lifetime.signal
    if (signal.aborted) return
    const revocation = (async () => {
      for (let retry = 0; ; retry++) {
        const revoked = await revokeToken({ origin: this.origin, token, signal }).then(() => true, (_revokeFailed: unknown) => false)
        // A failure consumes one try; the grant is already removed locally.
        if (revoked) return
        const delay = REVOKE_RETRY_DELAYS_MS[retry]
        if (delay === undefined) return
        try { await sleep(delay, undefined, { signal, ref: false }) } catch (_disposed) { return }
      }
    })().finally(() => { this.revocations.delete(revocation) })
    this.revocations.add(revocation)
  }

  private changed(): void {
    for (const listener of this.listeners) listener()
  }
}

export default CoperaAccount
