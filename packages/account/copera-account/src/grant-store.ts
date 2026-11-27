/**
 * Durable Copera grant with refresh serialized across processes. Copera revokes the whole login when a rotated
 * refresh token is presented again, so exactly one refresh may run per stored refresh token: the in-process
 * single-flight joins local callers and `modifyRecord` (the credentials file lock) serializes processes.
 * @module
 */
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import { CoperaOAuthError, GrantRevokedError, refreshGrant, type CoperaGrant } from './oauth.ts'

/** Credential record key of the Copera grant. */
export const GRANT_KEY = credentialKey('copera-account', 'default')

/**
 * Refresh deadline. The refresh runs while holding the credentials file lock, and other writers wait at most 30 s
 * for that lock, so the deadline stays below it.
 */
const REFRESH_TIMEOUT_MS = 20_000

const stored = z.object({
  version: z.literal(1),
  issuer: z.string(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number(),
  account: z.object({ name: z.string(), email: z.string(), workspaceName: z.string() }).nullable(),
})

/** Options of one store instance. */
export interface GrantStoreOptions {
  /** Refresh request deadline; defaults to 20 s and must stay below the 30 s credentials lock wait. */
  readonly refreshTimeoutMs?: number
  /** Called after this store removed a grant because Copera rejected its refresh token. */
  readonly onRevoked?: () => void
}

/** Reads, writes, and refreshes the Copera grant bound to one API origin. */
export class GrantStore {
  private inflight: Promise<CoperaGrant | null> | undefined
  private readonly refreshTimeoutMs: number

  /**
   * @param ctx - Context whose `credentials` service holds the record.
   * @param origin - API origin the grant was issued by; a record from another origin reads as absent.
   * @param options - refresh deadline and revocation observer.
   */
  constructor(private readonly ctx: Context, private readonly origin: string, private readonly options: GrantStoreOptions = {}) {
    this.refreshTimeoutMs = options.refreshTimeoutMs ?? REFRESH_TIMEOUT_MS
  }

  /**
   * Read the stored grant.
   * @returns the grant, or null when none is stored or the record is unreadable or issued by another origin.
   */
  async read(): Promise<CoperaGrant | null> {
    return this.parse(await this.ctx.credentials.readRecord(GRANT_KEY))
  }

  /**
   * Replace the stored grant.
   * @param grant - grant to store for this origin.
   */
  async write(grant: CoperaGrant): Promise<void> {
    await this.ctx.credentials.modifyRecord(GRANT_KEY, () => Promise.resolve(this.record(grant)))
  }

  /**
   * Delete the record only while it still holds `refreshToken`; another process may have stored a newer sign-in.
   * @param refreshToken - refresh token of the grant to remove.
   * @returns whether the record was deleted.
   */
  async clearIfRefreshTokenIs(refreshToken: string): Promise<boolean> {
    // A no-op modify re-reads the file under its lock; readRecord may answer from a cache another process outdated.
    const record = await this.ctx.credentials.modifyRecord(GRANT_KEY, () => Promise.resolve(undefined))
    if (record === undefined) return false
    const current = this.parse(record)
    // An unreadable or foreign record is not a sign-in this store can still use, so it is removable too.
    if (current !== null && current.refreshToken !== refreshToken) return false
    await this.ctx.credentials.deleteRecord(GRANT_KEY)
    return true
  }

  /**
   * Return a usable grant, refreshing it when it expires within `skewMs` or when `rejectedToken` is still the stored
   * access token. Concurrent callers in this process share one refresh; a caller in another process that already
   * replaced the token makes this call return the replacement without a request.
   * @param opts - token a server rejected, if any, and how early before expiry to refresh.
   * @returns the current grant, or null when none is stored or Copera revoked it (the record is then removed). When an
   *   early refresh of an unexpired, unrejected token fails on the network or times out, the current grant.
   * @throws CoperaOAuthError on a server failure, or on a network failure or timeout once the token has expired or was
   *   rejected; the record is kept for a later retry.
   */
  async refreshIfNeeded(opts: { rejectedToken?: string; skewMs: number }): Promise<CoperaGrant | null> {
    const current = await this.read()
    if (current === null) return null
    const needed = opts.rejectedToken === undefined
      ? current.expiresAt - opts.skewMs <= Date.now()
      : current.accessToken === opts.rejectedToken
    if (!needed) return current
    this.inflight ??= this.refresh(current.accessToken).finally(() => { this.inflight = undefined })
    try {
      return await this.inflight
    } catch (error) {
      // An early refresh that could not reach Copera leaves the current token usable until it expires.
      const transient = error instanceof CoperaOAuthError && (error.reason === 'network' || error.reason === 'timeout')
      if (transient && opts.rejectedToken === undefined && current.expiresAt > Date.now()) return current
      throw error
    }
  }

  /** Refresh under the credentials lock unless another writer already replaced `staleAccessToken`. */
  private async refresh(staleAccessToken: string): Promise<CoperaGrant | null> {
    let revoked: string | undefined
    const record = await this.ctx.credentials.modifyRecord(GRANT_KEY, async (record) => {
      const current = this.parse(record)
      if (current?.accessToken !== staleAccessToken) return undefined
      try {
        const next = await refreshGrant({ origin: this.origin, refreshToken: current.refreshToken, timeoutMs: this.refreshTimeoutMs })
        return this.record({ ...next, account: next.account ?? current.account })
      } catch (error) {
        if (!(error instanceof GrantRevokedError)) throw error
        // modifyRecord cannot delete; the removal re-checks the record after the lock is released.
        revoked = current.refreshToken
        return undefined
      }
    })
    if (revoked === undefined) return this.parse(record)
    if (await this.clearIfRefreshTokenIs(revoked)) {
      this.options.onRevoked?.()
      return null
    }
    return this.read()
  }

  private record(grant: CoperaGrant): CredentialRecord {
    const payload: z.infer<typeof stored> = { version: 1, issuer: this.origin, ...grant }
    return { kind: 'grant', payload: { ...payload, account: grant.account === null ? null : { ...grant.account } } }
  }

  private parse(record: CredentialRecord | undefined): CoperaGrant | null {
    if (record?.kind !== 'grant') return null
    const parsed = stored.safeParse(record.payload)
    if (!parsed.success || parsed.data.issuer !== this.origin) return null
    const { accessToken, refreshToken, expiresAt, account } = parsed.data
    return { accessToken, refreshToken, expiresAt, account }
  }
}
