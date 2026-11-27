/** Sidebar account launcher: the Copera identity, Settings, and sign-out. */
import { useRef, useState } from 'react'
import {
  Menu, Toast, IconUserOutlineRegular, type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { CoperaAccountFace } from './account-ui.ts'
import css from './AccountMenu.module.css'

/** Props of the `settings.launcher` entry. */
export type AccountMenuProps = Pick<PropsRuntime<'settings.launcher'>, 'wide' | 'settingsShortcut' | 'openSettings'>
  & InjectFace<CoperaAccountFace> & PropsLocale<'coperaAccount'>

/**
 * Render the launcher row and its menu. An environment-token session has no profile and no sign-out.
 * @param props - sidebar geometry, Settings navigation, account hook and operations, and localized copy.
 * @returns the launcher.
 */
export function AccountMenu({ wide, settingsShortcut, openSettings, useCoperaAccount, signOut, t }: AccountMenuProps) {
  const state = useCoperaAccount(view => view.state)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [signOutFailed, setSignOutFailed] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const signedIn = state?.status === 'signed-in'
  const profile = signedIn ? state.profile : null
  const envToken = signedIn && state.via === 'env-token'
  const label = profile?.name ?? (signedIn ? t('signedIn') : t('settings'))
  const items: MenuEntry[] = [
    ...profile === null ? [] : [
      { type: 'label', id: 'name', text: profile.name },
      { type: 'label', id: 'email', text: profile.email },
      { type: 'label', id: 'workspace', text: profile.workspaceName },
      { type: 'separator', id: 'identity' },
    ] satisfies MenuEntry[],
    ...envToken ? [{ type: 'label', id: 'env-token', text: t('envTokenSession') }, { type: 'separator', id: 'identity' }] satisfies MenuEntry[] : [],
    { id: 'settings', label: t('settings'),
      ...settingsShortcut === undefined ? {} : { shortcut: settingsShortcut } },
    ...signedIn && !envToken ? [{ id: 'sign-out', label: t('signOut'), disabled: busy }] : [],
  ]
  // The menu closes first: its focus return must settle before the sign-in screen takes focus.
  const runSignOut = async (): Promise<void> => {
    setOpen(false)
    setBusy(true)
    try {
      await signOut()
    } catch (_error) {
      // The grant is still stored; the toast reports it and the row stays available.
      setSignOutFailed(true)
    } finally { setBusy(false) }
  }
  const initial = profile?.name.trim().charAt(0).toUpperCase()
  return <div className={css.root}>
    {signOutFailed && <Toast text={t('signOutFailed')} onDone={() => { setSignOutFailed(false) }} />}
    <Menu open={open} side="top" portal autoFocus className={css.anchor} listClassName={css.menu}
      anchor={<button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide} aria-label={t('menu')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        <span className={css.avatar} aria-hidden="true">
          {initial === undefined || initial === '' ? <IconUserOutlineRegular size={14} /> : initial}
        </span>
        {wide && <span className={css.label}>{label}</span>}
      </button>}
      items={items}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        if (id === 'settings') { setOpen(false); trigger.current?.focus(); openSettings() }
        else if (id === 'sign-out') void runSignOut()
      }} />
  </div>
}
