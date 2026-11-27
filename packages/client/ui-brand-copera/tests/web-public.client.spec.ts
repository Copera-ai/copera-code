/** The Web shell's public files carry the Copera identity served at `/favicon.svg` and `/manifest.webmanifest`. */
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const PUBLIC = new URL('../../../../apps/web/public/', import.meta.url)
const SYMBOL = new URL('../src/client/assets/copera-symbol.svg', import.meta.url)

describe('Web shell public identity', () => {
  it('serves the Copera symbol as the favicon in both color schemes', async () => {
    const symbol = await readFile(SYMBOL, 'utf8')
    expect(symbol).toContain('#3463F3')
    expect(await readFile(new URL('favicon.svg', PUBLIC), 'utf8')).toBe(symbol)
    expect(await readFile(new URL('favicon-dark.svg', PUBLIC), 'utf8')).toBe(symbol)
  })

  it('names the installed application Copera Code on the dark background', async () => {
    const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', PUBLIC), 'utf8')) as Record<string, unknown>
    expect(manifest.name).toBe('Copera Code')
    expect(manifest.short_name).toBe('Copera Code')
    expect(manifest.background_color).toBe('#050505')
    expect(manifest.theme_color).toBe('#050505')
    expect(JSON.stringify(manifest)).not.toMatch(/DeepSeek|Harness|DSH/)
  })
})
