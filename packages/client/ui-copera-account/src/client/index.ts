/** Browser entry: mounts the coperaAccount Remote namespace and registers the sign-in screen and account menu. */
import type { Context } from '@deepseek-ai/cordis'
import coperaAccountRemote from '@deepseek-ai/dsh-copera-account/remote'
import { mountCoperaAccount } from './mount.ts'

export { inject } from './mount.ts'
export type { CoperaAccountFace, CoperaAccountView } from './account-ui.ts'
export type { CoperaAccountKey } from './locales.ts'

/**
 * Activate the Copera account UI.
 * @param ctx - Client runtime.
 * @returns complete UI and Remote disposer.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return await mountCoperaAccount(ctx, coperaAccountRemote)
}
