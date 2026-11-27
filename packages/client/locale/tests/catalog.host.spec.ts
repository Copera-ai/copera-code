import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { IndexInjection, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import { plainConfig } from '../../../settings/settings/src/schema.ts'
import { Config, apply } from '@deepseek-ai/dsh-client-locale'
import { LOCALE_CATALOG_GLOBAL } from '../src/locale-settings.ts'

const PAGE_PEER = { principal: { kind: 'owner' } } as Parameters<WebServer['renderIndex']>[1]

function collect(ctx: Context): IndexInjection[] {
  const table: IndexInjection[] = []
  ctx.emit('webserver/index-inject', table, PAGE_PEER)
  return table
}

describe('locale host language catalog', () => {
  it('injects nothing without a catalog', async () => {
    const ctx = new Context()
    const { fiber } = await liveConfig(ctx, { Config, apply })
    expect(plainConfig(fiber.effectiveConfig)).toEqual({})
    expect(collect(ctx)).toEqual([])
    await fiber.dispose()
  })

  it('publishes the configured languages and labels to the page before browser plugins start', async () => {
    const ctx = new Context()
    const { fiber } = await liveConfig(ctx, { Config, apply }, { languages: ['en', 'pt'], labels: { pt: 'Português (Brasil)' } })
    expect(collect(ctx)).toEqual([{
      kind: 'global',
      name: LOCALE_CATALOG_GLOBAL,
      value: { languages: ['en', 'pt'], labels: { pt: 'Português (Brasil)' } },
    }])
    await fiber.dispose()
    expect(collect(ctx)).toEqual([])
  })

  it('rejects a catalog without English at load', () => {
    const config = Config({ languages: ['pt'] })
    expect(() => { apply(new Context(), config) }).toThrow(/"en"/)
  })
})
