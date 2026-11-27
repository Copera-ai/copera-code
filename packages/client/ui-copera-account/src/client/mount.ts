/** Lifecycle of the coperaAccount Remote namespace, its state stream, and the two account registrations. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-copera-account/remote'
import type { CoperaAccountState } from '@deepseek-ai/dsh-copera-account/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { CoperaAccountFace, CoperaAccountView } from './account-ui.ts'
import { AccountMenu } from './AccountMenu.tsx'
import { BrowserTab } from './browser-tab.ts'
import { de, en, es, fr, ja, pt, ru, zh, type CoperaAccountKey } from './locales.ts'
import { LoginGate } from './LoginGate.tsx'
import { loginOrigin } from './login-origin.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { coperaAccount: CoperaAccountKey }
  interface SlotMap {
    /**
     * Optional brand mark shown before the product name on the sign-in screen. Without an occupant the screen shows
     * the product name alone.
     */
    'copera-account.gate.mark': { kind: 'single'; scope: 'root' }
  }
}

/** First delay before the state stream is opened again after it ended or failed; each further failure doubles it. */
const RESUBSCRIBE_DELAY_MS = 1_000

/** Longest delay between two attempts to open the state stream. */
const RESUBSCRIBE_MAX_DELAY_MS = 30_000

/** Services required before the namespace mounts. */
export const inject = ['remote', 'slots', 'locale']

/**
 * Address of the Host web server this window talks to. The desktop shell loads the client from its own scheme and
 * reaches the Host web server through the transport's stream base address.
 * @param desktop - whether the client runs inside the desktop shell.
 * @returns the address whose loopback origin receives the OAuth callback.
 */
function hostAddress(desktop: boolean): Pick<URL, 'protocol' | 'hostname' | 'port'> {
  const transport = (globalThis as typeof globalThis & { __DSH_TRANSPORT__?: { streamBaseUrl?: string } }).__DSH_TRANSPORT__
  return desktop && transport?.streamBaseUrl !== undefined ? new URL(transport.streamBaseUrl) : window.location
}

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('coperaAccount', { en, zh, ja, es, fr, de, ru, pt }), 'copera-account: dictionaries')
  const desktop = 'dshDesktop' in globalThis
  const login = loginOrigin(hostAddress(desktop))
  const account = createSnapshotStore<CoperaAccountView>({ state: undefined, failed: false })
  const browser = new BrowserTab(desktop)
  ctx.effect(() => () => { browser.dispose() }, 'copera-account: prepared browser tab')
  const publish = (state: CoperaAccountState): void => { account.set({ state, failed: false }) }
  const markFailed = (): void => { account.set({ ...account.getSnapshot(), failed: true }) }

  const reload = async (): Promise<void> => {
    const result = await ctx.remote.coperaAccount.getState()
    if (!result.ok) throw result.error
    publish(result.value)
  }

  ctx.effect(() => {
    // Read across closures: the disposer ends the current stream while its loop awaits.
    const lifetime = { ended: false }
    let current: { dispose: () => Promise<void> } | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    // While the stream is down, a window that regains focus or visibility reads the state once.
    const refresh = (): void => {
      if (document.visibilityState === 'hidden') return
      reload().catch((_unreachable: unknown) => {
        // The stream retry and the unreachable screen's own retry remain.
      })
    }
    let watchingFocus = false
    const watchFocus = (on: boolean): void => {
      if (on === watchingFocus) return
      watchingFocus = on
      if (on) {
        window.addEventListener('focus', refresh)
        document.addEventListener('visibilitychange', refresh)
      } else {
        window.removeEventListener('focus', refresh)
        document.removeEventListener('visibilitychange', refresh)
      }
    }
    const subscribe = (failures: number): void => {
      const stream = ctx.remote.$stream<CoperaAccountState>({
        name: 'coperaAccount',
        open: signal => ctx.remote.coperaAccount.watch(signal),
        ended: () => new Error('coperaAccount stream ended'),
        carrierFailed: () => { markFailed() },
      })
      current = stream
      let delivered = false
      void (async () => {
        for await (const item of stream) {
          if (lifetime.ended) return
          delivered = true
          watchFocus(false)
          publish(item.value)
          item.accept()
        }
      })().catch((_streamFailed: unknown) => {
        // An ended or failed stream is resubscribed below.
      }).finally(() => {
        if (lifetime.ended) return
        markFailed()
        watchFocus(true)
        const attempt = delivered ? 0 : failures
        retry = setTimeout(() => {
          void stream.dispose()
          subscribe(attempt + 1)
        }, Math.min(RESUBSCRIBE_MAX_DELAY_MS, RESUBSCRIBE_DELAY_MS * 2 ** attempt))
      })
    }
    subscribe(0)
    return () => {
      lifetime.ended = true
      clearTimeout(retry)
      watchFocus(false)
      return current?.dispose()
    }
  }, 'copera-account: state stream')

  const face: CoperaAccountFace = {
    hooks: { coperaAccount: account },
    login,
    async signIn() {
      if ('unsupported' in login) return
      browser.prepare()
      try {
        const result = await ctx.remote.coperaAccount.startSignIn(login.origin, desktop ? 'desktop' : 'web')
        if (!result.ok) throw result.error
        const attempt = result.value.attempt
        if (attempt?.phase === 'awaiting-browser') browser.open(attempt.authorizeUrl)
        else browser.dispose()
        publish(result.value)
      } catch (error) {
        browser.dispose()
        throw error
      }
    },
    openBrowser(authorizeUrl) { browser.open(authorizeUrl) },
    async cancelSignIn() {
      browser.dispose()
      const result = await ctx.remote.coperaAccount.cancelSignIn()
      if (!result.ok) throw result.error
    },
    async signOut() {
      const result = await ctx.remote.coperaAccount.signOut()
      if (!result.ok) throw result.error
    },
    reload,
  }

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'copera-account.sign-in', locale: 'coperaAccount', inject: () => face,
    children: { 'copera-account.gate.mark': { kind: 'single', scope: 'root' } },
  }, LoginGate))
  ctx.slots.inject('settings.launcher', () => ctx.slots.register({
    name: 'settings.launcher', locale: 'coperaAccount', inject: () => face,
  }, AccountMenu))
}

/**
 * Mount the namespace, then the UI that calls it; disposal withdraws the UI before the namespace.
 * @param ctx - Client plugin context owning the Remote, dictionaries, and slots.
 * @param contribution - generated `coperaAccount` Remote definitions.
 * @returns disposer joining UI and Remote withdrawal.
 */
export async function mountCoperaAccount(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.coperaAccount', 'slots', 'locale'], registerUi)
  try { await ui } catch (error) { await ui.dispose(); await disposeRemote(); throw error }
  return async () => { await ui.dispose(); await disposeRemote() }
}
