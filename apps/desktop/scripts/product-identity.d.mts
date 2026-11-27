/** Fixed Desktop identity values of Copera Code. */
export const productIdentity: {
  readonly productName: 'Copera Code'
  readonly appId: 'ai.copera.code'
  readonly protocolScheme: 'copera-code'
  readonly protocolName: 'Copera Code'
  readonly artifactPrefix: 'copera-code'
  readonly packageName: 'copera-code'
  readonly homeDirName: '.copera-code'
  readonly cliCommandName: 'copera-code'
}

/** Environment variable that switches Desktop auto-update packaging and runtime checks: `on` or `off`. */
export const DESKTOP_UPDATES_ENV: 'DSH_DESKTOP_UPDATES'

/** Copera Code ships without auto-update unless `DSH_DESKTOP_UPDATES=on` is set in the packaging settings. */
export const DESKTOP_UPDATES_DEFAULT: 'off'

/**
 * Resolve the auto-update switch of one packaging environment.
 * @param env - Packaging environment; an unset or empty value selects {@link DESKTOP_UPDATES_DEFAULT}.
 * @returns Whether packaging requires an update feed and policy origin and embeds update metadata.
 */
export function desktopUpdatesEnabled(env: NodeJS.ProcessEnv): boolean
