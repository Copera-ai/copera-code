/** Opening the Copera authorization page in the user's browser. */

/**
 * Opens the authorization page outside the client. A plain browser opens a blank tab during the user's click and
 * navigates it once the Host returns the page address, because a tab opened after an await is blocked as a pop-up.
 * The desktop shell routes every `window.open` of an http(s) address to the system browser and denies the window, so
 * it opens the address directly.
 */
export class BrowserTab {
  private pending: Window | null = null

  /** @param desktop - whether the client runs inside the desktop shell. */
  constructor(private readonly desktop: boolean) {}

  /** Open the blank tab; call synchronously inside the user's click. */
  prepare(): void {
    this.dispose()
    if (this.desktop) return
    this.pending = window.open('about:blank', '_blank')
    if (this.pending !== null) this.pending.opener = null
  }

  /**
   * Show the authorization page in the prepared tab, or open a new one.
   * @param authorizeUrl - `attempt.authorizeUrl` returned by the Host.
   */
  open(authorizeUrl: string): void {
    const tab = this.pending
    this.pending = null
    if (tab !== null && !tab.closed) {
      tab.location.replace(authorizeUrl)
      return
    }
    window.open(authorizeUrl, '_blank', 'noopener,noreferrer')
  }

  /** Close a prepared tab that never received the authorization page. */
  dispose(): void {
    this.pending?.close()
    this.pending = null
  }
}
