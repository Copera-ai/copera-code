import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmCopera from '@deepseek-ai/dsh-llm-copera'
import type { CoperaTokenSource } from '@deepseek-ai/dsh-llm-copera'
import { coperaBaseUrl, COPERA_ROUTE_ID, coperaUserAgent } from '../src/config.ts'

/** Signed-out `coperaTokens` provider; the plugin must never call it while mounting. */
class SignedOutTokens extends Service implements CoperaTokenSource {
  constructor(ctx: Context) {
    super(ctx, 'coperaTokens')
  }

  getAccessToken(): Promise<string | undefined> {
    return Promise.resolve(undefined)
  }

  onRejected(_rejectedToken: string): Promise<string | undefined> {
    return Promise.resolve(undefined)
  }
}

let ctx: Context

beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SignedOutTokens)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('coperaBaseUrl', () => {
  it('defaults to the production origin', () => {
    expect(coperaBaseUrl({})).toBe('https://api.copera.ai/public/v1')
  })

  it('uses an https origin override', () => {
    expect(coperaBaseUrl({ DSH_COPERA_API_ORIGIN: 'https://staging.copera.test' })).toBe('https://staging.copera.test/public/v1')
  })

  it('refuses a non-https origin except plain http on loopback', () => {
    expect(() => coperaBaseUrl({ DSH_COPERA_API_ORIGIN: 'http://x' })).toThrow(/https/)
    expect(() => coperaBaseUrl({ DSH_COPERA_API_ORIGIN: 'http://localhost:3000' })).toThrow(/https/)
    expect(() => coperaBaseUrl({ DSH_COPERA_API_ORIGIN: 'not a url' })).toThrow(/https/)
    expect(coperaBaseUrl({ DSH_COPERA_API_ORIGIN: 'http://127.0.0.1:4000' })).toBe('http://127.0.0.1:4000/public/v1')
    expect(coperaBaseUrl({ DSH_COPERA_API_ORIGIN: 'http://[::1]:4000' })).toBe('http://[::1]:4000/public/v1')
  })

  it('refuses an origin that carries a path, query, or credentials', () => {
    expect(() => coperaBaseUrl({ DSH_COPERA_API_ORIGIN: 'https://api.copera.ai/other' })).toThrow(/origin/)
    expect(() => coperaBaseUrl({ DSH_COPERA_API_ORIGIN: 'https://user:pw@api.copera.ai' })).toThrow(/origin/)
  })
})

describe('coperaUserAgent', () => {
  it('names the product version the launcher passes, and unknown otherwise', () => {
    expect(coperaUserAgent('0.1.0')).toBe('copera-code/0.1.0 (+https://github.com/Copera-ai/copera-code)')
    expect(coperaUserAgent(undefined)).toBe('copera-code/unknown (+https://github.com/Copera-ai/copera-code)')
    expect(coperaUserAgent('1.0 (evil)')).toBe('copera-code/unknown (+https://github.com/Copera-ai/copera-code)')
  })
})

describe('llm-copera plugin', () => {
  it('registers the copera route with both models and no settings section', async () => {
    vi.stubEnv('DSH_COPERA_API_ORIGIN', undefined)
    const fiber = ctx.plugin(LlmCopera)
    await fiber
    const providers = ctx.llm.listProviders()
    expect(providers.map(provider => provider.id)).toContain(COPERA_ROUTE_ID)
    const models = await ctx.llm.listModels(COPERA_ROUTE_ID)
    expect(models.map(model => model.id)).toEqual(['shikai', 'shikai-ultra-fast'])
    expect(ctx.llm.listConfigurableProviders().map(entry => entry.provider)).not.toContain(COPERA_ROUTE_ID)
    expect('Config' in LlmCopera).toBe(false)
    await fiber.dispose()
    expect(ctx.llm.listProviders().map(provider => provider.id)).not.toContain(COPERA_ROUTE_ID)
  })

  it('fails to start when DSH_COPERA_API_ORIGIN is not https', async () => {
    vi.stubEnv('DSH_COPERA_API_ORIGIN', 'http://x')
    await expect(ctx.plugin(LlmCopera)).rejects.toThrow(/https/)
  })
})
