/**
 * Launcher of the `copera-code` command: maps `COPERA_CODE_*` variables to the protected `DSH_*` names, fixes the
 * `copera` profile, and runs the dsh CLI under the `copera-code` name.
 * @module @deepseek-ai/dsh-copera-launch
 */

export {
  COPERA_CODE_BIN,
  COPERA_CODE_HOME_DIR_NAME,
  COPERA_PROFILE,
  resolveLaunch,
  resolveProductEnv,
  type RejectedLaunch,
  type ResolvedLaunch,
} from './resolve-launch.ts'
export { DEFAULT_WEB_PORT, portInUse, runCoperaCode, type CoperaCodeRuntime } from './run.ts'
