/** Remote-visible types of the Copera account service; this module holds types only. */

/** Copera user and workspace the stored sign-in belongs to. */
export interface CoperaAccountProfile {
  /** Display name of the signed-in user. */
  readonly name: string
  /** Email address of the signed-in user. */
  readonly email: string
  /** Name of the Copera workspace the sign-in was granted for. */
  readonly workspaceName: string
}

/**
 * The latest browser sign-in attempt. `awaiting-browser` lasts until the callback arrives, the attempt is cancelled,
 * or `expiresAt` passes; the other phases are terminal and stay until the next `startSignIn` or `cancelSignIn`.
 */
export interface CoperaSignInAttempt {
  /** `denied`: the user declined consent; `expired`: no callback before `expiresAt`; `failed`: the code exchange failed. */
  readonly phase: 'awaiting-browser' | 'denied' | 'expired' | 'failed'
  /** Copera authorization page the browser must open; carries no secret. */
  readonly authorizeUrl: string
  /** Epoch milliseconds after which the attempt no longer accepts a callback. */
  readonly expiresAt: number
}

/** Account state as clients see it; never carries a token, code, or PKCE secret. */
export interface CoperaAccountState {
  /** `signed-in` when a stored OAuth grant or the `DSH_COPERA_TOKEN` environment token is available. */
  readonly status: 'signed-out' | 'signed-in'
  /** Which credential backs `signed-in`; the OAuth grant wins over the environment token. Null while signed out. */
  readonly via: 'oauth' | 'env-token' | null
  /** Profile from the OAuth token response; null for the environment token or when Copera sent none. */
  readonly profile: CoperaAccountProfile | null
  /** Latest sign-in attempt, or null when none is pending or reportable. */
  readonly attempt: CoperaSignInAttempt | null
  /** `session-expired` after Copera rejected the stored refresh token in this process; cleared by the next sign-in or sign-out. */
  readonly notice: 'session-expired' | null
}
