/** Data and operations the sign-in screen and the account menu share. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { CoperaAccountState } from '@deepseek-ai/dsh-copera-account/types'
import type { LoginOrigin } from './login-origin.ts'

/** The account state this client last received. */
export interface CoperaAccountView {
  /** Latest Host state; undefined until the first stream item or `reload` arrives. */
  readonly state: CoperaAccountState | undefined
  /** The state stream lost its carrier or ended; `state` keeps the last received value. */
  readonly failed: boolean
}

/** Injected face of both registrations. */
export interface CoperaAccountFace {
  hooks: { coperaAccount: ObservableSnapshot<CoperaAccountView> }
  /** Callback origin of this window, fixed for the plugin lifetime. */
  login: LoginOrigin
  /**
   * Start or join a sign-in attempt and open its authorization page in the user's browser.
   * @returns after the Host accepted the attempt; rejects when it refused or could not be reached.
   */
  signIn: () => Promise<void>
  /**
   * Open the authorization page again; call it from a user gesture.
   * @param authorizeUrl - `attempt.authorizeUrl` of the current attempt.
   */
  openBrowser: (authorizeUrl: string) => void
  /** @returns after the Host discarded the attempt; rejects on failure. */
  cancelSignIn: () => Promise<void>
  /** @returns after the Host removed the stored grant; rejects on failure. */
  signOut: () => Promise<void>
  /** @returns after one `getState` read replaced the published state; rejects on failure. */
  reload: () => Promise<void>
}
