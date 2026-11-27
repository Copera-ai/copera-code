import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { FinishReason, GenerateOptions, Message, TokenUsage } from '@deepseek-ai/dsh-llm'
import { CoperaAdapter } from '../src/adapter.ts'
import { COPERA_ROUTE_ID } from '../src/config.ts'
import type { CoperaTokenSource } from '../src/token-source.ts'
import { closeFakes, data, fakeShikai } from './fake-shikai.ts'
import type { FakeShikai } from './fake-shikai.ts'

afterEach(async () => {
  await closeFakes()
})

/** Token source double: hands out `current` and swaps in `replacement` on rejection. */
class FakeTokens implements CoperaTokenSource {
  readonly rejected: string[] = []
  constructor(public current: string | undefined, private readonly replacement?: string) {}

  getAccessToken(): Promise<string | undefined> {
    return Promise.resolve(this.current)
  }

  onRejected(rejectedToken: string): Promise<string | undefined> {
    this.rejected.push(rejectedToken)
    if (this.replacement !== undefined) this.current = this.replacement
    return Promise.resolve(this.replacement)
  }
}

interface Assembled {
  message: Message
  usage?: TokenUsage
  finish: FinishReason
}

let ctx: Context

beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(LlmRuntime)
})

function register(fake: FakeShikai, tokens: CoperaTokenSource): CoperaAdapter {
  const adapter = new CoperaAdapter({ baseUrl: fake.baseUrl, tokens })
  ctx.llm.registerAdapter([COPERA_ROUTE_ID], adapter)
  return adapter
}

const request = (overrides: Partial<GenerateOptions> = {}): GenerateOptions => ({
  provider: COPERA_ROUTE_ID,
  model: 'shikai',
  messages: [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })],
  ...overrides,
})

async function assemble(options: GenerateOptions): Promise<Assembled> {
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
  return {
    message: assembler.message({ provider: options.provider, model: options.model }),
    ...assembler.usage === undefined ? {} : { usage: assembler.usage },
    finish: assembler.finish,
  }
}

/** Settle within a bound so a hang fails the spec instead of timing out the worker. */
async function settles<T>(promise: Promise<T>, ms = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error(`did not settle within ${ms}ms`)) }, ms)
  })
  try {
    return await Promise.race([promise, deadline])
  } finally {
    clearTimeout(timer)
  }
}

const textAnswer = [
  data({ choices: [{ index: 0, delta: { role: 'assistant', content: 'hello' }, finish_reason: null }] }),
  data({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
  data({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } }),
  data('[DONE]'),
]

function failureOf(finish: FinishReason) {
  expect(finish.kind).toBe('error')
  if (finish.kind !== 'error') throw new Error('unreachable')
  return finish.failure
}

describe('CoperaAdapter request', () => {
  it('posts an OpenAI chat-completions stream request to /public/v1/chat/completions with the bearer token', async () => {
    const fake = await fakeShikai([{ sse: textAnswer }])
    register(fake, new FakeTokens('tok-1'))
    const result = await assemble(request({
      system: 'be brief',
      maxTokens: 100,
    }))
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(fake.requests).toHaveLength(1)
    const [sent] = fake.requests
    expect(sent?.method).toBe('POST')
    expect(sent?.path).toBe('/public/v1/chat/completions')
    expect(sent?.headers.authorization).toBe('Bearer tok-1')
    expect(sent?.body).toMatchObject({
      model: 'shikai',
      stream: true,
      stream_options: { include_usage: true },
      include_reasoning: true,
      max_tokens: 100,
    })
    expect(sent?.body).not.toHaveProperty('max_completion_tokens')
    expect(sent?.body).not.toHaveProperty('store')
    const roles = (sent?.body.messages as { role: string }[]).map(message => message.role)
    expect(roles).toEqual(['system', 'user'])
  })

  it('sends the shikai-ultra-fast model id unchanged', async () => {
    const fake = await fakeShikai([{ sse: textAnswer }])
    register(fake, new FakeTokens('tok-1'))
    await assemble(request({ model: 'shikai-ultra-fast' }))
    expect(fake.requests[0]?.body.model).toBe('shikai-ultra-fast')
  })

  it('fails AUTH without any request when no access token is available', async () => {
    const fake = await fakeShikai([{ sse: textAnswer }])
    register(fake, new FakeTokens(undefined))
    const failure = failureOf((await assemble(request())).finish)
    expect(failure.code).toBe('AUTH')
    expect(fake.requests).toHaveLength(0)
  })
})

describe('CoperaAdapter stream translation', () => {
  it('maps reasoning, fragmented tool calls, and usage with cached tokens', async () => {
    const fake = await fakeShikai([{
      sse: [
        data({ choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'think ' }, finish_reason: null }] }),
        data({ choices: [{ index: 0, delta: { reasoning_content: 'more' }, finish_reason: null }] }),
        data({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '' } }] }, finish_reason: null }] }),
        data({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"pa' } }] }, finish_reason: null }] }),
        data({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a' } }] }, finish_reason: null }] }),
        data({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '.ts"}' } }] }, finish_reason: null }] }),
        data({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
        data({
          choices: [],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 40 } },
        }),
        data('[DONE]'),
      ],
    }])
    register(fake, new FakeTokens('tok-1'))
    const result = await assemble(request({
      tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } }],
    }))
    expect(result.finish).toEqual({ kind: 'tool-calls' })
    expect(result.message.content).toEqual([
      { type: 'reasoning', text: 'think more' },
      { type: 'tool-call', id: 'call_1', name: 'read_file', arguments: '{"path":"a.ts"}' },
    ])
    expect(result.usage).toMatchObject({ inputTokens: 60, outputTokens: 20, cacheReadTokens: 40, totalTokens: 120 })
    const tools = fake.requests[0]?.body.tools as { type: string; function: { name: string } }[]
    expect(tools.map(tool => [tool.type, tool.function.name])).toEqual([['function', 'read_file']])
  })

  it('ignores keep-alive comment lines between events', async () => {
    const fake = await fakeShikai([{
      sse: [': keep-alive\n\n', textAnswer[0] ?? '', ': keep-alive\n\n', ...textAnswer.slice(1)],
    }])
    register(fake, new FakeTokens('tok-1'))
    const result = await assemble(request())
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(result.message.content).toEqual([{ type: 'text', text: 'hello' }])
  })

  it('ends with an error when the stream carries an in-band error and no [DONE]', async () => {
    const fake = await fakeShikai([{
      sse: [
        data({ choices: [{ index: 0, delta: { role: 'assistant', content: 'par' }, finish_reason: null }] }),
        data({ error: { message: 'Every Shikai route failed to answer this request.', type: 'server_error', code: 'upstream_error' } }),
      ],
      end: 'hold',
    }])
    register(fake, new FakeTokens('tok-1'))
    const result = await settles(assemble(request()))
    expect(failureOf(result.finish)).toEqual({ code: 'SERVER', message: 'Every Shikai route failed to answer this request.' })
  })

  it('classifies an in-stream insufficient_quota event as QUOTA', async () => {
    const fake = await fakeShikai([{
      sse: [
        data({ choices: [{ index: 0, delta: { role: 'assistant', content: 'par' }, finish_reason: null }] }),
        data({ error: { message: 'AI is paused until the allowance resets.', type: 'insufficient_quota', code: 'insufficient_quota' } }),
      ],
    }])
    register(fake, new FakeTokens('tok-1'))
    const result = await settles(assemble(request()))
    expect(failureOf(result.finish)).toEqual({ code: 'QUOTA', message: 'AI is paused until the allowance resets.' })
  })

  it('classifies an in-stream rate_limit_exceeded event split across writes as RATE_LIMIT', async () => {
    const event = data({ error: { message: 'Too many requests.', type: 'rate_limit_error', code: 'rate_limit_exceeded' } })
    const fake = await fakeShikai([{
      sse: [
        data({ choices: [{ index: 0, delta: { role: 'assistant', content: 'par' }, finish_reason: null }] }),
        event.slice(0, 20),
        event.slice(20),
      ],
    }])
    register(fake, new FakeTokens('tok-1'))
    const result = await settles(assemble(request()))
    expect(failureOf(result.finish)).toEqual({ code: 'RATE_LIMIT', message: 'Too many requests.' })
  })

  it('delivers each chunk while the stream is still open', async () => {
    const fake = await fakeShikai([{
      sse: [data({ choices: [{ index: 0, delta: { role: 'assistant', content: 'early' }, finish_reason: null }] })],
      end: 'hold',
    }])
    register(fake, new FakeTokens('tok-1'))
    const controller = new AbortController()
    const firstText = async (): Promise<string> => {
      for await (const chunk of ctx.llm.stream(request({ signal: controller.signal }))) {
        if (chunk.type === 'text-delta') return chunk.text
      }
      return ''
    }
    try {
      expect(await settles(firstText())).toBe('early')
    } finally {
      controller.abort()
    }
  })

  it('ends with an error when the connection is cut mid-stream', async () => {
    const fake = await fakeShikai([{
      sse: [data({ choices: [{ index: 0, delta: { role: 'assistant', content: 'par' }, finish_reason: null }] })],
      end: 'destroy',
    }])
    register(fake, new FakeTokens('tok-1'))
    const result = await settles(assemble(request()))
    expect(failureOf(result.finish).code).toBe('TRANSPORT')
  })
})

describe('CoperaAdapter rejected tokens', () => {
  const unauthorized = {
    status: 401,
    body: { error: { message: 'Invalid token', type: 'invalid_request_error', code: 'invalid_api_key' } },
  }

  it('reports the rejected token once and replays the request once with the replacement', async () => {
    const fake = await fakeShikai([unauthorized, { sse: textAnswer }])
    const tokens = new FakeTokens('tok-old', 'tok-new')
    register(fake, tokens)
    const result = await assemble(request())
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(tokens.rejected).toEqual(['tok-old'])
    expect(fake.requests.map(sent => sent.headers.authorization)).toEqual(['Bearer tok-old', 'Bearer tok-new'])
    expect(fake.requests[1]?.body).toEqual(fake.requests[0]?.body)
  })

  it('fails AUTH when the replayed request is rejected again', async () => {
    const fake = await fakeShikai([unauthorized, unauthorized])
    const tokens = new FakeTokens('tok-old', 'tok-new')
    register(fake, tokens)
    const failure = failureOf((await assemble(request())).finish)
    expect(failure).toMatchObject({ code: 'AUTH', status: 401, message: 'Invalid token' })
    expect(tokens.rejected).toEqual(['tok-old'])
    expect(fake.requests).toHaveLength(2)
  })

  it('fails AUTH without a replay when no different token is available', async () => {
    const fake = await fakeShikai([unauthorized])
    const tokens = new FakeTokens('tok-old')
    register(fake, tokens)
    const failure = failureOf((await assemble(request())).finish)
    expect(failure.code).toBe('AUTH')
    expect(tokens.rejected).toEqual(['tok-old'])
    expect(fake.requests).toHaveLength(1)
  })
})

describe('CoperaAdapter error classification', () => {
  it('reports an exhausted quota as QUOTA, which the route retry policy does not retry', async () => {
    const fake = await fakeShikai([{
      status: 429,
      headers: { 'x-should-retry': 'false' },
      body: { error: { message: 'Your AI budget for this period is used up.', type: 'insufficient_quota', code: 'insufficient_quota' } },
    }])
    const adapter = register(fake, new FakeTokens('tok-1'))
    const failure = failureOf((await assemble(request())).finish)
    expect(failure).toEqual({ code: 'QUOTA', status: 429, message: 'Your AI budget for this period is used up.' })
    const policy = adapter.providerRetryPolicy(COPERA_ROUTE_ID)
    expect(policy?.mode).toBe('normal')
    if (policy?.mode !== 'normal') throw new Error('unreachable')
    expect(policy.retryableCodes).not.toContain('QUOTA')
    expect(policy.retryableCodes).toContain('RATE_LIMIT')
    expect(fake.requests).toHaveLength(1)
  })

  it('reports a rate limit as RATE_LIMIT with the retry-after delay', async () => {
    const fake = await fakeShikai([{
      status: 429,
      headers: { 'retry-after': '2' },
      body: { error: { message: 'Too many requests.', type: 'rate_limit_error', code: 'rate_limit_exceeded' } },
    }])
    register(fake, new FakeTokens('tok-1'))
    const failure = failureOf((await assemble(request())).finish)
    expect(failure).toEqual({ code: 'RATE_LIMIT', status: 429, providerRetryAfterMs: 2000, message: 'Too many requests.' })
  })

  it('reports permission_denied as a non-retryable AUTH failure without asking for a new token', async () => {
    const fake = await fakeShikai([{
      status: 403,
      body: { error: { message: 'Token lacks the Shikai permission.', type: 'permission_error', code: 'permission_denied' } },
    }])
    const tokens = new FakeTokens('tok-1', 'tok-2')
    register(fake, tokens)
    const failure = failureOf((await assemble(request())).finish)
    expect(failure).toEqual({ code: 'AUTH', status: 403, message: 'Token lacks the Shikai permission.' })
    expect(tokens.rejected).toEqual([])
    expect(fake.requests).toHaveLength(1)
  })
})

describe('CoperaAdapter catalog', () => {
  it('lists exactly shikai and shikai-ultra-fast, signed in or not', async () => {
    const fake = await fakeShikai([])
    register(fake, new FakeTokens(undefined))
    const models = await ctx.llm.listModels(COPERA_ROUTE_ID)
    expect(models.map(model => model.id)).toEqual(['shikai', 'shikai-ultra-fast'])
    expect(models.every(model => model.inputModalities?.join() === 'text,image')).toBe(true)
    expect(fake.requests).toHaveLength(0)
  })

  it('describes both models with a 200000-token window, a 16000-token output cap, and no reasoning efforts', async () => {
    const fake = await fakeShikai([])
    const adapter = register(fake, new FakeTokens('tok-1'))
    for (const id of ['shikai', 'shikai-ultra-fast']) {
      const info = await adapter.resolveModel(COPERA_ROUTE_ID, id)
      expect(info.context?.contextWindow).toBe(200000)
      expect(info.defaultMaxTokens).toBe(16000)
      expect(info.reasoning).toBeUndefined()
    }
  })
})
