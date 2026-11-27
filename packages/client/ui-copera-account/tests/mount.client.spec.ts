// @vitest-environment jsdom
/** The plugin mounts the coperaAccount namespace, follows its state stream and drives sign-in from this window. */
import { afterEach, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { CoperaAccountState } from '@deepseek-ai/dsh-copera-account/types'
import { inject, mountCoperaAccount } from '../src/client/mount.ts'
import { LoginGate } from '../src/client/LoginGate.tsx'
import { AccountMenu } from '../src/client/AccountMenu.tsx'
import type { CoperaAccountFace } from '../src/client/account-ui.ts'

const REMOTE: TypertRemoteContribution = { package: '@deepseek-ai/dsh-copera-account', descriptors: [] }
const signedOut: CoperaAccountState = { status: 'signed-out', via: null, profile: null, attempt: null, notice: null }
const AUTHORIZE = 'http://127.0.0.1:9911/oauth/authorize?state=s'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

/** A Host state stream the test pushes into; it ends when its signal aborts or the test ends it. */
function hostStream() {
  const pending: CoperaAccountState[] = []
  let wake: (() => void) | undefined
  let opened = 0
  let end: (() => void) | undefined
  const push = (state: CoperaAccountState) => { pending.push(state); wake?.() }
  async function* watch(signal: AbortSignal): AsyncGenerator<CoperaAccountState> {
    opened++
    let ended = false
    end = () => { ended = true; wake?.() }
    while (!signal.aborted && !ended) {
      const next = pending.shift()
      if (next !== undefined) { yield next; continue }
      await new Promise<void>((resolve) => { wake = resolve; signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    }
    if (ended) throw new Error('carrier lost')
  }
  return { push, watch, opened: () => opened, end: () => { end?.() } }
}

async function fixture() {
  const ctx = new Context()
  const unmount = vi.fn(async () => {})
  const host = hostStream()
  const streams: AbortController[] = []
  class Remote extends Service {
    constructor() { super(ctx, 'remote') }
    async $mount(contribution: TypertRemoteContribution) {
      expect(contribution).toBe(REMOTE)
      return unmount
    }
    $stream<T>(options: { open: (signal: AbortSignal) => AsyncIterable<T> }) {
      const controller = new AbortController()
      streams.push(controller)
      const source = options.open(controller.signal)
      return {
        async *[Symbol.asyncIterator]() {
          for await (const value of source) yield { generation: 1, value, signal: controller.signal, accept: () => {} }
        },
        restart: () => {},
        dispose: async () => { controller.abort() },
      }
    }
  }
  new Remote()
  const startSignIn = vi.fn(async (_origin: string, _source: 'web' | 'desktop') =>
    ({ ok: true as const, value: { ...signedOut, attempt: { phase: 'awaiting-browser' as const, authorizeUrl: AUTHORIZE, expiresAt: 1 } } }))
  const cancelSignIn = vi.fn(async () => ({ ok: true as const, value: undefined }))
  const signOut = vi.fn(async () => ({ ok: true as const, value: undefined }))
  const getState = vi.fn(async () => ({ ok: true as const, value: signedOut }))
  ctx.provide('remote.coperaAccount', { startSignIn, cancelSignIn, signOut, getState, watch: host.watch })
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'shell.overlay': { kind: 'list', scope: 'root' },
    'settings.launcher': { kind: 'single', scope: 'root' },
  } } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply: (scope: Context) => mountCoperaAccount(scope, REMOTE) })
  await fiber
  return { ctx, fiber, host, streams, unmount, startSignIn, cancelSignIn, signOut, getState }
}

function face(ctx: Context, component: unknown): CoperaAccountFace {
  const name = component === LoginGate ? 'shell.overlay' : 'settings.launcher'
  const entry = ctx.slots.entries(name).find(item => item.component === component)
  expect(entry).toBeDefined()
  const injected: object = entry!.inject!()
  return injected as CoperaAccountFace
}

it('registers the sign-in screen and the account menu, and withdraws both with the namespace', async () => {
  const b = await fixture()
  expect(face(b.ctx, LoginGate)).toBe(face(b.ctx, AccountMenu))
  await b.fiber.dispose()
  expect(b.ctx.slots.entries('shell.overlay')).toHaveLength(0)
  expect(b.ctx.slots.entries('settings.launcher')).toHaveLength(0)
  expect(b.streams.every(stream => stream.signal.aborted)).toBe(true)
  expect(b.unmount).toHaveBeenCalledOnce()
})

it('publishes every streamed state, including a session that expired after sign-in', async () => {
  const b = await fixture()
  const account = face(b.ctx, LoginGate).hooks.coperaAccount
  expect(account.getSnapshot().state).toBeUndefined()
  b.host.push({ ...signedOut, status: 'signed-in', via: 'oauth' })
  await vi.waitFor(() => { expect(account.getSnapshot().state?.status).toBe('signed-in') })
  b.host.push({ ...signedOut, notice: 'session-expired' })
  await vi.waitFor(() => { expect(account.getSnapshot().state?.notice).toBe('session-expired') })
  await b.fiber.dispose()
})

it('signs in with the 127.0.0.1 callback origin of a localhost page and opens the authorization page in a tab opened during the click', async () => {
  const tab = { closed: false, opener: {}, location: { replace: vi.fn() }, close: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as never)
  const b = await fixture()
  expect(window.location.hostname).toBe('localhost')
  await face(b.ctx, LoginGate).signIn()
  expect(b.startSignIn).toHaveBeenCalledExactlyOnceWith(`http://127.0.0.1:${window.location.port}`, 'web')
  expect(open).toHaveBeenCalledExactlyOnceWith('about:blank', '_blank')
  expect(tab.opener).toBeNull()
  expect(tab.location.replace).toHaveBeenCalledExactlyOnceWith(AUTHORIZE)
  await b.fiber.dispose()
})

it('in the desktop shell signs in against the Host web server and lets the shell route the page to the system browser', async () => {
  vi.stubGlobal('dshDesktop', {})
  vi.stubGlobal('__DSH_TRANSPORT__', { streamBaseUrl: 'http://127.0.0.1:43117/api' })
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const b = await fixture()
  await face(b.ctx, LoginGate).signIn()
  expect(b.startSignIn).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:43117', 'desktop')
  expect(open).toHaveBeenCalledExactlyOnceWith(AUTHORIZE, '_blank', 'noopener,noreferrer')
  await b.fiber.dispose()
})

it('closes the prepared tab and rejects when the Host refuses to start', async () => {
  const tab = { closed: false, opener: {}, location: { replace: vi.fn() }, close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(tab as never)
  const b = await fixture()
  b.startSignIn.mockResolvedValueOnce({ ok: false, error: new Error('refused') } as never)
  await expect(face(b.ctx, LoginGate).signIn()).rejects.toThrow()
  expect(tab.close).toHaveBeenCalledOnce()
  await b.fiber.dispose()
})

it('cancels, signs out and reloads through the Remote', async () => {
  const b = await fixture()
  const actions = face(b.ctx, AccountMenu)
  await actions.cancelSignIn()
  await actions.signOut()
  await actions.reload()
  expect(b.cancelSignIn).toHaveBeenCalledOnce()
  expect(b.signOut).toHaveBeenCalledOnce()
  expect(b.getState).toHaveBeenCalledOnce()
  expect(actions.hooks.coperaAccount.getSnapshot()).toEqual({ state: signedOut, failed: false })
  await b.fiber.dispose()
})

it('resubscribes with backoff after the state stream ends and reads the state on focus until it is back', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const b = await fixture()
    const account = face(b.ctx, LoginGate).hooks.coperaAccount
    await vi.waitFor(() => { expect(b.host.opened()).toBe(1) })
    b.host.end()
    await vi.waitFor(() => { expect(account.getSnapshot().failed).toBe(true) })
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => { expect(b.getState).toHaveBeenCalledOnce() })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => { expect(b.getState).toHaveBeenCalledTimes(2) })
    expect(b.host.opened()).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => { expect(b.host.opened()).toBe(2) })
    // A subscription that ends again before delivering anything doubles the delay.
    b.host.end()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(b.host.opened()).toBe(2)
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => { expect(b.host.opened()).toBe(3) })
    b.host.push({ ...signedOut, status: 'signed-in', via: 'oauth' })
    await vi.waitFor(() => { expect(account.getSnapshot()).toMatchObject({ failed: false, state: { status: 'signed-in' } }) })
    window.dispatchEvent(new Event('focus'))
    expect(b.getState).toHaveBeenCalledTimes(2)
    // After a delivered state the next loss starts again from the first delay.
    b.host.end()
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => { expect(b.host.opened()).toBe(4) })
    await b.fiber.dispose()
  } finally { vi.useRealTimers() }
})
