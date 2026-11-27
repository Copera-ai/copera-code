/**
 * Copera Code Desktop identity: the one source for the product name, application ID, URL scheme, artifact and
 * package names, data directory, and terminal command name. Packaging scripts import this file; the Electron main
 * process imports it through the `#product-identity` package import.
 */

/** Fixed Desktop identity values of Copera Code. */
export const productIdentity = Object.freeze({
  productName: 'Copera Code',
  appId: 'ai.copera.code',
  protocolScheme: 'copera-code',
  protocolName: 'Copera Code',
  artifactPrefix: 'copera-code',
  packageName: 'copera-code',
  homeDirName: '.copera-code',
  cliCommandName: 'copera-code',
})

/** Environment variable that switches Desktop auto-update packaging and runtime checks: `on` or `off`. */
export const DESKTOP_UPDATES_ENV = 'DSH_DESKTOP_UPDATES'

/** Copera Code ships without auto-update unless `DSH_DESKTOP_UPDATES=on` is set in the packaging settings. */
export const DESKTOP_UPDATES_DEFAULT = 'off'

/**
 * Resolve the auto-update switch of one packaging environment.
 * @param {NodeJS.ProcessEnv} env - Packaging environment; an unset or empty value selects {@link DESKTOP_UPDATES_DEFAULT}.
 * @returns {boolean} Whether packaging requires an update feed and policy origin and embeds update metadata.
 * @throws {Error} When the value is neither `on` nor `off`.
 */
export function desktopUpdatesEnabled(env) {
  const value = env[DESKTOP_UPDATES_ENV]?.trim() || DESKTOP_UPDATES_DEFAULT
  if (value !== 'on' && value !== 'off') throw new Error(`desktop package: ${DESKTOP_UPDATES_ENV} must be on or off`)
  return value === 'on'
}
