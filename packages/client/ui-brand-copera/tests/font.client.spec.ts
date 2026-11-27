/** The bundled Inter face embeds exactly the shipped woff2 file, so the face cannot drift from the licensed font. */
// @vitest-environment jsdom
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTER_FONT_FACE_CSS, INTER_WOFF2_BASE64, installInterFace } from '../src/client/fonts/inter-face.ts'

const FONTS = join(import.meta.dirname, '../src/client/fonts')

describe('bundled Inter font', () => {
  it('declares one variable Inter face whose data URL is the shipped woff2 file', async () => {
    const woff2 = await readFile(join(FONTS, 'Inter-latin-wght-normal.woff2'))
    expect(INTER_FONT_FACE_CSS.match(/@font-face/g)).toHaveLength(1)
    expect(INTER_FONT_FACE_CSS).toContain("font-family: 'Inter'")
    expect(INTER_FONT_FACE_CSS).toContain('font-weight: 100 900')
    expect(INTER_FONT_FACE_CSS).toContain(`url(data:font/woff2;base64,${INTER_WOFF2_BASE64})`)
    expect(Buffer.from(INTER_WOFF2_BASE64, 'base64').equals(woff2)).toBe(true)
    expect(INTER_FONT_FACE_CSS).not.toMatch(/url\((?!data:)/)
  })

  it('adds the face to the document head and removes it on dispose', () => {
    const dispose = installInterFace(document)
    const style = document.head.querySelector('style[data-copera-font="inter"]')
    expect(style?.textContent).toBe(INTER_FONT_FACE_CSS)
    dispose()
    expect(document.head.querySelector('style[data-copera-font]')).toBeNull()
  })

  it('ships the SIL Open Font License beside the font', async () => {
    const license = await readFile(join(FONTS, 'OFL.txt'), 'utf8')
    expect(license.split('\n')[0]).toBe('Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)')
    expect(license).toContain('SIL Open Font License, Version 1.1')
    for (const section of ['PREAMBLE', 'DEFINITIONS', 'PERMISSION & CONDITIONS', 'TERMINATION', 'DISCLAIMER']) {
      expect(license).toContain(section)
    }
  })

  it('lists Inter under its licence in the third-party notices', async () => {
    const notices = await readFile(join(import.meta.dirname, '../../../../THIRD_PARTY_NOTICES.md'), 'utf8')
    expect(notices).toContain('Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)')
    expect(notices).toContain('packages/client/ui-brand-copera/src/client/fonts/OFL.txt')
  })
})
