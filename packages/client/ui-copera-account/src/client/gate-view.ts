/** Which sign-in screen the client shows for an account state. */
import type { CoperaSignInAttempt } from '@deepseek-ai/dsh-copera-account/types'
import type { CoperaAccountView } from './account-ui.ts'
import type { LoginOrigin } from './login-origin.ts'

/** One sign-in screen; `hidden` lets the client through. */
export type GateKind =
  | 'hidden' | 'loading' | 'unreachable' | 'unsupported' | 'signed-out' | 'session-expired'
  | 'awaiting' | 'denied' | 'expired' | 'failed'

/**
 * Select the screen for the latest account view.
 * @param view - published account state and stream health.
 * @param login - callback origin of this window.
 * @param startFailed - this screen's last start or cancel request was rejected or unreachable.
 * @returns the screen to render.
 */
export function gateKind(view: CoperaAccountView, login: LoginOrigin, startFailed: boolean): GateKind {
  const state = view.state
  if (state === undefined) return view.failed ? 'unreachable' : 'loading'
  if (state.status === 'signed-in') return 'hidden'
  if ('unsupported' in login) return 'unsupported'
  if (startFailed) return 'failed'
  if (state.attempt !== null) return attemptKind(state.attempt.phase)
  return state.notice === 'session-expired' ? 'session-expired' : 'signed-out'
}

function attemptKind(phase: CoperaSignInAttempt['phase']): GateKind {
  switch (phase) {
    case 'awaiting-browser': return 'awaiting'
    case 'denied': return 'denied'
    case 'expired': return 'expired'
    case 'failed': return 'failed'
  }
}
