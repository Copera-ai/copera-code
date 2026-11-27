// @vitest-environment jsdom
/** The sidebar account menu shows the Copera identity and signs out. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { CoperaAccountState } from '@deepseek-ai/dsh-copera-account/types'
import { AccountMenu, type AccountMenuProps } from '../src/client/AccountMenu.tsx'
import type { CoperaAccountView } from '../src/client/account-ui.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const oauth: CoperaAccountState = {
  status: 'signed-in', via: 'oauth', attempt: null, notice: null,
  profile: { name: 'Ana Souza', email: 'ana@example.test', workspaceName: 'Acme Engenharia' },
}

function mount(state: CoperaAccountState) {
  const props: AccountMenuProps = {
    useCoperaAccount: bindSnapshotSelector(createSnapshotStore<CoperaAccountView>({ state, failed: false })),
    login: { origin: 'http://127.0.0.1:3080' },
    signIn: vi.fn(async () => {}),
    openBrowser: vi.fn(),
    cancelSignIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    wide: true,
    openSettings: vi.fn(),
    t: makeTranslate(en),
  }
  render(<AccountMenu {...props} />)
  fireEvent.click(screen.getByRole('button', { name: en.menu }))
  return props
}

it('shows the name, email and workspace of the signed-in user', () => {
  mount(oauth)
  const text = document.body.textContent
  expect(text).toContain('Ana Souza')
  expect(text).toContain('ana@example.test')
  expect(text).toContain('Acme Engenharia')
})

it('signs out from the menu', async () => {
  const props = mount(oauth)
  await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: en.signOut })) })
  expect(props.signOut).toHaveBeenCalledOnce()
})

it('opens Settings from the menu', () => {
  const props = mount(oauth)
  fireEvent.click(screen.getByRole('menuitem', { name: en.settings }))
  expect(props.openSettings).toHaveBeenCalledOnce()
})

it('names the environment token and offers no sign-out for it', () => {
  mount({ ...oauth, via: 'env-token', profile: null })
  expect(document.body.textContent).toContain(en.envTokenSession)
  expect(screen.queryByRole('menuitem', { name: en.signOut })).toBeNull()
})
