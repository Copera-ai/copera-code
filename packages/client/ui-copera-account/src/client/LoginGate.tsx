/** Full-window Copera sign-in screen shown while the Host has no Copera credential. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconLoadingOutlineRegular, useModalLayer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { CoperaAccountFace, CoperaAccountView } from './account-ui.ts'
import { gateKind, type GateKind } from './gate-view.ts'
import type { CoperaAccountKey } from './locales.ts'
import css from './LoginGate.module.css'

/** Props of the `shell.overlay` sign-in entry. */
export type LoginGateProps = InjectFace<CoperaAccountFace> & PropsLocale<'coperaAccount'>
  & Pick<PropsRenderSlots<'copera-account.gate.mark'>, 'renderSlot'>

const COPY: Record<Exclude<GateKind, 'hidden' | 'loading'>, readonly [CoperaAccountKey, CoperaAccountKey]> = {
  'unreachable': ['unreachableTitle', 'unreachableDescription'],
  'unsupported': ['unsupportedTitle', 'unsupportedDescription'],
  'signed-out': ['signInTitle', 'signInDescription'],
  'session-expired': ['sessionExpiredTitle', 'sessionExpiredDescription'],
  'awaiting': ['awaitingTitle', 'awaitingDescription'],
  'denied': ['deniedTitle', 'deniedDescription'],
  'expired': ['expiredTitle', 'expiredDescription'],
  'failed': ['failedTitle', 'failedDescription'],
}

/** Escape never dismisses the sign-in screen. */
function keepOpen(): void {}

/**
 * Render the sign-in screen over the whole window while signed out, loading, or unable to read the account.
 * @param props - account hook, sign-in operations, the brand-mark child slot, and localized copy.
 * @returns the body-portaled screen, or null while signed in.
 */
export function LoginGate(props: LoginGateProps) {
  const view = props.useCoperaAccount(value => value)
  const [failedFor, setFailedFor] = useState<CoperaAccountView['state'] | null>(null)
  // A failed start belongs to the state it was attempted from; any newer Host state, such as an expired session,
  // replaces it.
  const startFailed = failedFor !== null && failedFor === view.state
  const setStartFailed = (failed: boolean): void => { setFailedFor(failed ? view.state : null) }
  const kind = gateKind(view, props.login, startFailed)
  if (kind === 'hidden') return null
  return <GateSurface {...props} kind={kind} expiresAt={view.state?.attempt?.expiresAt}
    authorizeUrl={view.state?.attempt?.authorizeUrl} setStartFailed={setStartFailed} />
}

function GateSurface({
  kind, expiresAt, authorizeUrl, setStartFailed, login, signIn, openBrowser, cancelSignIn, reload, renderSlot, t,
}: LoginGateProps & {
  kind: Exclude<GateKind, 'hidden'>
  expiresAt: number | undefined
  authorizeUrl: string | undefined
  setStartFailed: (failed: boolean) => void
}) {
  const dialog = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [busy, setBusy] = useState(false)
  useModalLayer(dialog, true, keepOpen)
  // The application root stays out of the tab order and the accessibility tree while the screen covers it.
  useLayoutEffect(() => {
    const root = document.getElementById('root')
    if (root === null) return
    const previous = root.hasAttribute('inert')
    root.setAttribute('inert', '')
    return () => { root.toggleAttribute('inert', previous) }
  }, [])
  // A screen change can replace the focused control; keep focus on the screen's primary action.
  useLayoutEffect(() => {
    const element = dialog.current
    const active = document.activeElement
    if (element === null || active !== element && element.contains(active)) return
    element.querySelector<HTMLElement>('[data-modal-autofocus]')?.focus()
  }, [kind])

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setStartFailed(false)
    try { await action() } catch (_error) {
      // The Host refused or could not be reached; the failed screen offers another try.
      setStartFailed(true)
    } finally { setBusy(false) }
  }
  const reloadAccount = async (): Promise<void> => {
    setBusy(true)
    try { await reload() } catch (_error) {
      // The unreachable screen stays and keeps its retry.
    } finally { setBusy(false) }
  }

  const [titleKey, descriptionKey] = kind === 'loading' ? ['loading', null] as const : COPY[kind]
  const title = t(titleKey)
  const description = descriptionKey === null ? null : t(descriptionKey)
  const spinner = <IconLoadingOutlineRegular className={css.spinner} aria-hidden="true" />
  let actions = null
  switch (kind) {
    case 'loading':
    case 'unsupported':
      break
    case 'unreachable':
      actions = <Button variant="primary" className={css.primary} data-modal-autofocus disabled={busy}
        onClick={() => { void reloadAccount() }}>{busy ? spinner : null}{t('tryAgain')}</Button>
      break
    case 'awaiting':
      actions = <>
        <Button variant="primary" className={css.primary} data-modal-autofocus disabled={authorizeUrl === undefined}
          onClick={() => { if (authorizeUrl !== undefined) openBrowser(authorizeUrl) }}>{t('openAgain')}</Button>
        <Button variant="outline" className={css.secondary} disabled={busy}
          onClick={() => { void run(cancelSignIn) }}>{t('cancel')}</Button>
      </>
      break
    case 'signed-out':
    case 'session-expired':
    case 'denied':
    case 'expired':
    case 'failed':
      actions = <Button variant="primary" className={css.primary} data-modal-autofocus disabled={busy} aria-busy={busy || undefined}
        onClick={() => { void run(signIn) }}>
        {busy ? spinner : null}{t(kind === 'signed-out' || kind === 'session-expired' ? 'signIn' : 'tryAgain')}
      </Button>
      break
  }

  return createPortal(
    <div className={css.gate} data-copera-sign-in={kind} data-unsupported={'unsupported' in login || undefined}>
      <div className={css.dragBand} data-window-drag aria-hidden="true" />
      <div ref={dialog} className={css.panel} role="dialog" aria-modal="true" tabIndex={-1}
        aria-labelledby={titleId} aria-describedby={description === null ? undefined : descriptionId}
        aria-busy={kind === 'loading' || undefined} data-window-drag-controls>
        <div className={css.brand}>
          {renderSlot('copera-account.gate.mark', {})}
          <span className={css.productName}>{t('productName')}</span>
        </div>
        <h1 id={titleId} className={css.title}>{title}</h1>
        {kind === 'loading'
          ? <div className={css.loading}>{spinner}</div>
          : <p id={descriptionId} className={css.description}>{description}</p>}
        {kind === 'awaiting' && expiresAt !== undefined && <Countdown expiresAt={expiresAt} t={t} />}
        {actions !== null && <div className={css.actions}>{actions}</div>}
        <div role="status" aria-live="polite" className={css.visuallyHidden}>
          {description === null ? title : `${title}. ${description}`}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Countdown({ expiresAt, t }: { expiresAt: number; t: LoginGateProps['t'] }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => { setNow(Date.now()) }, 1000)
    return () => { clearInterval(timer) }
  }, [])
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const time = `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`
  return <p className={css.countdown}>{t('expiresIn', { time })}</p>
}
