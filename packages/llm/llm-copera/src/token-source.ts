/**
 * Service contract for the Copera access token that the `copera` LLM route
 * sends as its bearer credential. This package owns the contract; an account
 * package provides the `coperaTokens` service.
 * @module
 */

/**
 * Supplies the current Copera access token and replaces a token that Shikai
 * rejected. Implementations own storage, refresh, and serialization of
 * concurrent refreshes; the adapter never reads a token from the environment.
 */
export interface CoperaTokenSource {
  /**
   * Read the access token to send on the next request.
   * @returns the current access token, or `undefined` when the user is signed out.
   */
  getAccessToken(): Promise<string | undefined>
  /**
   * Report that Shikai answered 401 for a token and obtain its replacement.
   * @param rejectedToken - the bearer token that the rejected request carried.
   * @returns a replacement token, or `undefined` (or the same token) when no
   * valid token is available and the user must sign in again.
   */
  onRejected(rejectedToken: string): Promise<string | undefined>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    coperaTokens: CoperaTokenSource
  }
}
