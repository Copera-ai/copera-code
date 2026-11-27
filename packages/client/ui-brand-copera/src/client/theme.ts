/** Copera Code token layer stacked over the built-in light and dark palettes. */
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Override-layer identity passed to `ThemeRuntime.overrideTokens`. */
export const COPERA_THEME_SOURCE = 'copera'

/** Copera primary blue. */
const PRIMARY = '#3463F3'

/** Inter leads the built-in system stack; the stack stays as the fallback for scripts Inter's Latin subset does not cover. */
const INTER_FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif"

/**
 * Token values by palette. The light palette keeps its base surfaces (the
 * light values of the two surface tokens repeat the built-in light palette,
 * because a layer must name both modes) and takes the blue accent; the dark palette moves to the Copera near-black
 * base with matching sidebar and raised surfaces. Accent text (links, focus,
 * business state) uses a lighter blue on dark so it keeps contrast against
 * `#050505`.
 */
export const COPERA_THEME_TOKENS: ThemeTokenOverrides = {
  '--dsw-alias-brand-primary': { light: PRIMARY, dark: PRIMARY },
  '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: PRIMARY, dark: PRIMARY },
  '--dsw-alias-button-primary-hover': { light: '#2A52D6', dark: '#4F7AF6' },
  '--dsw-alias-label-primary-foreground': { light: '#FFFFFF', dark: '#FFFFFF' },
  '--dsw-alias-link': { light: PRIMARY, dark: '#7896F8' },
  '--dsw-alias-state-business-primary': { light: PRIMARY, dark: '#7896F8' },
  '--dsw-alias-bg-base': { light: '#FFFFFF', dark: '#050505' },
  '--dsw-specific-sidebar-fill': { light: '#F9FAFB', dark: '#0B0B0D' },
  '--dsh-font-family-text-default': { light: INTER_FONT_STACK, dark: INTER_FONT_STACK },
  '--dsw-font-family-brand': { light: INTER_FONT_STACK, dark: INTER_FONT_STACK },
}
