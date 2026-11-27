/**
 * Copera Code environment of the Electron main process.
 *
 * The Host loads the opened project's `.env` and protects only `DSH_*` names from it, so the user-facing
 * `COPERA_CODE_*` variables are read here, from the real process environment, before any Desktop path is resolved
 * and before the Host starts. The rule is the one the `copera-code` command applies.
 */

import { resolveProductEnv } from '@deepseek-ai/dsh-copera-launch/src/resolve-launch.ts'

function assign(env: NodeJS.ProcessEnv, product: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(product)) {
    if (value === undefined) Reflect.deleteProperty(env, name)
    else env[name] = value
  }
}

/**
 * Replace the product variables of one environment: `DSH_HOME` becomes `COPERA_CODE_HOME` or `<homedir>/.copera-code`
 * (an inherited `DSH_HOME` is ignored), `DSH_TELEMETRY_DISABLED` becomes `1`, and `DSH_COPERA_TOKEN` and
 * `DSH_COPERA_API_ORIGIN` are copied from `COPERA_CODE_TOKEN` and `COPERA_CODE_API_ORIGIN` or deleted.
 * @param env - Environment changed in place; the main process passes `process.env`, which the Host inherits.
 * @param homedir - Operating-system home directory.
 * @throws Error when `COPERA_CODE_API_ORIGIN` is not an `https:` URL; the data home and telemetry switch are
 *   already applied and `DSH_COPERA_API_ORIGIN` is deleted, so no later path or child reaches another home.
 */
export function applyDesktopProductEnvironment(env: NodeJS.ProcessEnv, homedir: string): void {
  let product: Record<string, string | undefined>
  try {
    product = resolveProductEnv(env, homedir)
  } catch (error) {
    assign(env, resolveProductEnv({ ...env, COPERA_CODE_API_ORIGIN: undefined }, homedir))
    throw error
  }
  assign(env, product)
}
