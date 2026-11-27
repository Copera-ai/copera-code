// @vitest-environment jsdom
/** The sign-in screen blocks the client while signed out and reports every sign-in phase. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { CoperaAccountState } from '@deepseek-ai/dsh-copera-account/types'
import { LoginGate, type LoginGateProps } from '../src/client/LoginGate.tsx'
import type { CoperaAccountView } from '../src/client/account-ui.ts'
import type { LoginOrigin } from '../src/client/login-origin.ts'
import { en, pt, type CoperaAccountKey } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.useRealTimers(); document.getElementById('root')?.remove() })

const signedOut: CoperaAccountState = { status: 'signed-out', via: null, profile: null, attempt: null, notice: null }
const AUTHORIZE = 'http://127.0.0.1:9911/oauth/authorize?client_id=copera-code&state=s'

interface MountOptions { login?: LoginOrigin; failed?: boolean; copy?: Record<CoperaAccountKey, string> }

function mount(state: CoperaAccountState | undefined, options: MountOptions = {}) {
  const root = document.createElement('div')
  root.id = 'root'
  root.append(Object.assign(document.createElement('button'), { textContent: 'background' }))
  document.body.append(root)
  const store = createSnapshotStore<CoperaAccountView>({ state, failed: options.failed ?? false })
  const props: LoginGateProps = {
    useCoperaAccount: bindSnapshotSelector(store),
    login: options.login ?? { origin: 'http://127.0.0.1:3080' },
    signIn: vi.fn(async () => {}),
    openBrowser: vi.fn(),
    cancelSignIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    renderSlot: () => null,
    t: makeTranslate(options.copy ?? en),
  }
  render(<LoginGate {...props} />)
  return { props, store, root }
}

it('covers the client while signed out, makes the background inert and focuses the sign-in button', () => {
  const { root } = mount(signedOut)
  const dialog = screen.getByRole('dialog', { name: en.signInTitle })
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(dialog.textContent).toContain(en.productName)
  expect(root.hasAttribute('inert')).toBe(true)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: en.signIn }))
})

it('keeps the gate open on Escape', () => {
  mount(signedOut)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('starts sign-in from the primary button', async () => {
  const { props } = mount(signedOut)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.signIn })) })
  expect(props.signIn).toHaveBeenCalledOnce()
})

it('reports a failed start as a network error with a retry', async () => {
  const { props } = mount(signedOut)
  vi.mocked(props.signIn).mockRejectedValueOnce(new Error('offline'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.signIn })) })
  expect(screen.getByRole('dialog', { name: en.failedTitle }).textContent).toContain(en.failedDescription)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.tryAgain })) })
  expect(props.signIn).toHaveBeenCalledTimes(2)
})

it('explains the environment token when the address cannot receive the callback', () => {
  mount(signedOut, { login: { unsupported: true } })
  const dialog = screen.getByRole('dialog', { name: en.unsupportedTitle })
  expect(dialog.textContent).toContain('COPERA_CODE_TOKEN')
  expect(screen.queryByRole('button', { name: en.signIn })).toBeNull()
})

it('waits for the browser with reopen, cancel and the time left', async () => {
  vi.useFakeTimers({ now: 1_000_000, toFake: ['Date', 'setInterval', 'clearInterval'] })
  const { props } = mount({ ...signedOut, attempt: { phase: 'awaiting-browser', authorizeUrl: AUTHORIZE, expiresAt: 1_000_000 + 125_000 } })
  const dialog = screen.getByRole('dialog', { name: en.awaitingTitle })
  expect(dialog.textContent).toContain('2:05')
  act(() => { vi.advanceTimersByTime(2_000) })
  expect(dialog.textContent).toContain('2:03')
  fireEvent.click(screen.getByRole('button', { name: en.openAgain }))
  expect(props.openBrowser).toHaveBeenCalledExactlyOnceWith(AUTHORIZE)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.cancel })) })
  expect(props.cancelSignIn).toHaveBeenCalledOnce()
})

it.each([
  ['denied', en.deniedTitle, en.deniedDescription],
  ['expired', en.expiredTitle, en.expiredDescription],
  ['failed', en.failedTitle, en.failedDescription],
] as const)('reports a %s attempt and offers another try', async (phase, title, description) => {
  const { props } = mount({ ...signedOut, attempt: { phase, authorizeUrl: AUTHORIZE, expiresAt: 0 } })
  expect(screen.getByRole('dialog', { name: title }).textContent).toContain(description)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.tryAgain })) })
  expect(props.signIn).toHaveBeenCalledOnce()
})

it('disappears once signed in and returns with the session-expired message', () => {
  const { store, root } = mount(signedOut)
  act(() => { store.set({ state: { ...signedOut, status: 'signed-in', via: 'oauth' }, failed: false }) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(root.hasAttribute('inert')).toBe(false)
  act(() => { store.set({ state: { ...signedOut, notice: 'session-expired' }, failed: false }) })
  const dialog = screen.getByRole('dialog', { name: en.sessionExpiredTitle })
  expect(dialog.textContent).toContain(en.sessionExpiredDescription)
  expect(root.hasAttribute('inert')).toBe(true)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: en.signIn }))
})

it('announces each status change through a polite live region', () => {
  const { store } = mount(signedOut)
  const status = screen.getByRole('status')
  expect(status.getAttribute('aria-live')).toBe('polite')
  expect(status.textContent).toContain(en.signInTitle)
  act(() => { store.set({ state: { ...signedOut, attempt: { phase: 'denied', authorizeUrl: AUTHORIZE, expiresAt: 0 } }, failed: false }) })
  expect(status.textContent).toContain(en.deniedTitle)
})

it('blocks while the account state loads and offers a retry when it cannot be read', async () => {
  mount(undefined)
  expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true')
  cleanup()
  const { props } = mount(undefined, { failed: true })
  expect(screen.getByRole('dialog', { name: en.unreachableTitle })).toBeTruthy()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.tryAgain })) })
  expect(props.reload).toHaveBeenCalledOnce()
})

it('renders Brazilian Portuguese copy', () => {
  mount(signedOut, { copy: pt })
  expect(screen.getByRole('button', { name: 'Entrar com Copera' })).toBeTruthy()
})

it('moves focus from the loading screen to the sign-in button when the state arrives', () => {
  const { store } = mount(undefined)
  expect(document.activeElement).toBe(screen.getByRole('dialog'))
  act(() => { store.set({ state: signedOut, failed: false }) })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: en.signIn }))
})
