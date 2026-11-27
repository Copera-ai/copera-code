/** Copera access tokens for the `copera` model route, from the OAuth grant or the launcher's environment token. */
import type { CoperaTokenSource } from '@deepseek-ai/dsh-llm-copera'
import type { GrantStore } from './grant-store.ts'

/** Refresh an access token that expires within this window before using it. */
export const REFRESH_SKEW_MS = 60_000

/** The `coperaTokens` provider: the stored OAuth grant first, then `DSH_COPERA_TOKEN`. */
export class AccountTokenSource implements CoperaTokenSource {
  /**
   * @param store - grant store bound to the configured API origin.
   * @param envToken - reads `DSH_COPERA_TOKEN` at call time; empty counts as absent.
   */
  constructor(private readonly store: GrantStore, private readonly envToken: () => string | undefined) {}

  async getAccessToken(): Promise<string | undefined> {
    const grant = await this.store.refreshIfNeeded({ skewMs: REFRESH_SKEW_MS })
    return grant?.accessToken ?? this.environmentToken()
  }

  async onRejected(rejectedToken: string): Promise<string | undefined> {
    // The environment token cannot be refreshed; the user must replace it.
    if (rejectedToken === this.environmentToken()) return undefined
    const grant = await this.store.refreshIfNeeded({ rejectedToken, skewMs: REFRESH_SKEW_MS })
    return grant?.accessToken ?? this.environmentToken()
  }

  private environmentToken(): string | undefined {
    const value = this.envToken()
    return value === undefined || value === '' ? undefined : value
  }
}
