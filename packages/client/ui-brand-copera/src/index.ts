/**
 * Copera Code brand plugin, node half: paints the dark boot canvas with the
 * Copera background before any script or client plugin runs. The browser half
 * ships through `exports["./client"]`.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** Copera dark background; ui-theme's boot row decides whether the dark palette is active. */
const DARK_BACKGROUND = '#050505'

/**
 * Head CSS for the pre-plugin interval. ui-theme's boot script marks `body`
 * with `data-ds-dark-theme` before first paint; this rule only recolors that
 * state, so a light or system-light preference keeps its own canvas.
 */
const BOOT_STYLE = `body[data-ds-dark-theme]{background-color:${DARK_BACKGROUND};--dsh-boot-bg:${DARK_BACKGROUND}}`

/**
 * Add the Copera dark canvas row to every index render.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: BOOT_STYLE })
  })
}
