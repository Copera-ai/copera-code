// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply, inject } from '../src/client/index.ts'
import { CoperaGateMark, CoperaMark, CoperaName } from '../src/client/CoperaMark.tsx'
import { CoperaHeroFrame } from '../src/client/CoperaHeroFrame.tsx'
import { COPERA_THEME_SOURCE, COPERA_THEME_TOKENS } from '../src/client/theme.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const HOLES = [
  'sidebar.brand.mark',
  'sidebar.brand.name',
  'conversation.hero.brand.mark',
  'conversation.hero.frame',
  'copera-account.gate.mark',
] as const

/** Stand-ins for the locale and theme services the plugin injects. */
function services() {
  const themeLayers = new Map<string, ThemeTokenOverrides>()
  const theme = {
    overrideTokens: vi.fn((source: string, tokens: ThemeTokenOverrides) => {
      themeLayers.set(source, tokens)
      return () => { themeLayers.delete(source) }
    }),
  }
  const registered = new Map<string, unknown>()
  const overrides = new Map<string, Record<string, string>>()
  const locale = {
    register: vi.fn((ns: string, dicts: unknown) => {
      registered.set(ns, dicts)
      return () => { registered.delete(ns) }
    }),
    override: vi.fn((ns: string, language: string, entries: Record<string, string>) => {
      overrides.set(`${ns}/${language}`, entries)
      return () => { overrides.delete(`${ns}/${language}`) }
    }),
    bind: vi.fn(() => (key: string) => key),
  }
  return { theme, themeLayers, locale, registered, overrides }
}

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const fakes = services()
  ctx.provide('theme', fakes.theme as never)
  ctx.provide('locale', fakes.locale as never)
  const declareHoles = () => slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, {
      kind: name === 'conversation.hero.frame' ? 'hoc' : 'single',
      scope: 'root',
    }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, declareHoles, disposeHoles, ...fakes }
}

describe('Copera brand browser plugin', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'theme', 'locale'])
  })

  it('fills the sidebar brand, hero mark, hero frame, and sign-in screen mark, and removes them on teardown', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)
    expect(subject.slots.entries('conversation.hero.frame')[0]?.options.id).toBe('copera-hero')

    subject.disposeHoles?.()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
    subject.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
  })

  it('waits for declarations that arrive after apply', async () => {
    const subject = await bench(false)
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
    subject.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)
  })

  it('stacks the Copera token layer with the blue primary, the near-black base, and Inter', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(subject.theme.overrideTokens).toHaveBeenCalledWith(COPERA_THEME_SOURCE, COPERA_THEME_TOKENS)
    const layer = subject.themeLayers.get('copera')
    expect(layer?.['--dsw-alias-brand-primary']).toEqual({ light: '#3463F3', dark: '#3463F3' })
    expect(layer?.['--dsw-alias-bg-base']?.dark).toBe('#050505')
    for (const token of ['--dsh-font-family-text-default', '--dsw-font-family-brand']) {
      expect(layer?.[token]?.light).toMatch(/^'Inter', /)
      expect(layer?.[token]?.dark).toBe(layer?.[token]?.light)
    }
    await fiber.dispose()
    expect(subject.themeLayers.size).toBe(0)
  })

  it('registers the brand dictionary and the en and pt overrides for the plugin lifetime', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(subject.registered.has('brand.copera')).toBe(true)
    expect(subject.overrides.get('common/en')?.['brand.localBuild']).toContain('Copera Code')
    expect(subject.overrides.get('common/pt')?.['brand.localBuild']).toContain('Copera Code')
    await fiber.dispose()
    expect(subject.registered.size).toBe(0)
    expect(subject.overrides.size).toBe(0)
  })

  it('renders the Copera symbol at each requested size and the localized product name', () => {
    const mark = render(<CoperaMark size={24} />)
    const image = mark.container.querySelector('img')
    expect(image?.getAttribute('width')).toBe('24')
    expect(image?.getAttribute('alt')).toBe('')
    mark.rerender(<CoperaMark size={34} className="host" />)
    expect(mark.container.querySelector('img')?.getAttribute('height')).toBe('34')
    expect(mark.container.querySelector('img')?.classList.contains('host')).toBe(true)
    mark.unmount()

    const gate = render(<CoperaGateMark />)
    expect(gate.container.querySelector('img')?.getAttribute('width')).toBe('28')
    gate.unmount()

    const name = render(<CoperaName t={key => key === 'name' ? 'Copera Code' : 'unexpected key'} />)
    expect(name.container.textContent).toBe('Copera Code')
  })

  it('wraps the scroll body without a decoration outside the blank home', () => {
    const home = render(<CoperaHeroFrame hero><p>body</p></CoperaHeroFrame>)
    expect(home.container.querySelector('[data-copera-hero]')).not.toBeNull()
    expect(home.container.textContent).toBe('body')
    home.rerender(<CoperaHeroFrame hero={false}><p>body</p></CoperaHeroFrame>)
    expect(home.container.querySelector('[data-copera-hero]')).toBeNull()
    expect(home.container.textContent).toBe('body')
  })
})
