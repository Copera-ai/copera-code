/** Required deployment-selected metadata for mandatory-update policy requests. */
export interface DesktopPolicyEnvironment {
  origin: string
  allowedPageOrigins: string[]
  allowedAuthOrigins?: string[]
  authentication: 'anonymous' | 'feishu-test'
  [key: string]: unknown
}

/**
 * Resolve policy settings before artifact preparation or signing.
 * @param environment File-owned release settings; only the selected origin is required.
 * @returns Policy metadata with deployment-selected origin and authentication.
 */
export function resolveDesktopPolicyEnvironment(environment: NodeJS.ProcessEnv): DesktopPolicyEnvironment

// COPERA: Copera Code has no policy service, so a build embeds a policy only when its settings name one.
/**
 * Report whether release settings ask for a mandatory-update policy; any one setting makes the whole policy required.
 * @param environment File-owned release settings.
 * @returns Whether {@link resolveDesktopPolicyEnvironment} must run and its policy be embedded.
 */
export function desktopPolicyConfigured(environment: NodeJS.ProcessEnv): boolean
