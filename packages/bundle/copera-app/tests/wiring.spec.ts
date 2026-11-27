/**
 * The `copera` profile's account and model rows booted through the Cordis Loader: the real `coperaTokens` service of
 * `copera-account` authenticates the real `copera` route of `llm-copera` against a local fake of the Copera API.
 *
 * The rows come from the composed `copera` profile (dsh-base, dsh-web-app, dsh-copera-app). Only the rows the token
 * path needs are mounted (`llm`, `credentials`, `copera-account`, `llm-copera`); the credentials row is pointed at a
 * temporary file, and package names map to Loader builtins so the spec does not depend on built `lib/` output.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { globSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { bundlePatchPaths, composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import * as CoperaAccount from '@deepseek-ai/dsh-copera-account'
import { GrantStore } from '@deepseek-ai/dsh-copera-account/src/grant-store.ts'
import * as Credentials from '@deepseek-ai/dsh-credentials-local'
import * as Llm from '@deepseek-ai/dsh-llm'
import { BlockAssembler, createUserMessage, type FinishReason } from '@deepseek-ai/dsh-llm'
import * as LlmCopera from '@deepseek-ai/dsh-llm-copera'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

interface Row {
  id?: string
  name?: string
  config?: unknown
  disabled?: unknown
}

const repositoryRoot = resolve(import.meta.dirname, '../../../..')
const bundleDirs = new Map(globSync('packages/*/*/package.json', { cwd: repositoryRoot }).map((path) => {
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8')) as { name: string }
  return [manifest.name, dirname(resolve(repositoryRoot, path))]
}))

/** The top-level rows of the composed shipped `copera` profile. */
function coperaProfileRows(): Row[] {
  const template = PROFILE_TEMPLATES.copera
  if (template === undefined) throw new Error('no copera profile template')
  const layers = template.bundles.map((name) => {
    const dir = bundleDirs.get(name)
    if (dir === undefined) throw new Error(`${name} is not a workspace package`)
    const manifest = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as {
      dsh: { bundle: { patch: string | string[] } }
    }
    return bundlePatchPaths(dir, manifest.dsh.bundle).flatMap(path => loadOverlayPatches('test', path))
  })
  return composeEntries(layers, (warning) => { throw new Error(warning) })
}

/** The rows this spec mounts, with the package each one must name. */
const MOUNTED = {
  llm: { name: '@deepseek-ai/dsh-llm', module: Llm },
  credentials: { name: '@deepseek-ai/dsh-credentials-local', module: Credentials },
  'copera-account': { name: '@deepseek-ai/dsh-copera-account', module: CoperaAccount },
  'llm-copera': { name: '@deepseek-ai/dsh-llm-copera', module: LlmCopera },
} as const

function mountedRows(): Array<Row & { id: string }> {
  const rows = coperaProfileRows()
  return Object.entries(MOUNTED).map(([id, { name }]) => {
    const row = rows.find(candidate => candidate.id === id)
    expect(row, `copera profile row ${id}`).toBeDefined()
    expect(row?.name, `copera profile row ${id}`).toBe(name)
    expect(row?.disabled, `copera profile row ${id}`).toBeUndefined()
    return { ...row, id }
  })
}

/** Local stand-in for the Copera API origin: `/oauth/token` refreshes and Shikai's chat completions. */
interface FakeCoperaApi {
  readonly origin: string
  /** `refresh_token` values presented to `/oauth/token`, in order. */
  readonly refreshes: string[]
  /** Bearer tokens presented to `/public/v1/chat/completions`, in order. */
  readonly completions: string[]
  /** Answer the next completion requests with 401 while they present one of these tokens. */
  readonly rejectTokens: Set<string>
}

const SSE_ANSWER = [
  { choices: [{ index: 0, delta: { role: 'assistant', content: 'hello' }, finish_reason: null }] },
  { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  { choices: [], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } },
].map(value => `data: ${JSON.stringify(value)}\n\n`).join('') + 'data: [DONE]\n\n'

async function startFakeCoperaApi(): Promise<FakeCoperaApi> {
  const refreshes: string[] = []
  const completions: string[] = []
  const rejectTokens = new Set<string>()
  let issued = 0
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    req.setEncoding('utf8')
    let text = ''
    for await (const chunk of req) text += String(chunk)
    const path = new URL(req.url ?? '/', 'http://fake.invalid').pathname
    if (req.method === 'POST' && path === '/oauth/token') {
      const form = new URLSearchParams(text)
      if (form.get('grant_type') !== 'refresh_token') { res.writeHead(400).end(); return }
      refreshes.push(form.get('refresh_token') ?? '')
      issued++
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        access_token: `access-${issued}`, refresh_token: `refresh-${issued}`, expires_in: 3600, token_type: 'Bearer',
      }))
      return
    }
    if (req.method === 'POST' && path === '/public/v1/chat/completions') {
      const token = (req.headers.authorization ?? '').replace(/^Bearer /u, '')
      completions.push(token)
      if (rejectTokens.has(token)) {
        res.writeHead(401, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: { message: 'Invalid token', type: 'invalid_request_error', code: 'invalid_api_key' } }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' }).end(SSE_ANSWER)
      return
    }
    res.writeHead(404).end()
  }
  const server = createServer((req, res) => { void handle(req, res).catch(() => { res.writeHead(500).end() }) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  onTestFinished(async () => {
    const closed = once(server, 'close')
    server.close()
    server.closeAllConnections()
    await closed
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing fake address')
  return { origin: `http://127.0.0.1:${String(address.port)}`, refreshes, completions, rejectTokens }
}

/** Boot the copera profile's token-path rows through the Loader against `api`, with an optional stored grant. */
async function boot(api: FakeCoperaApi, grant?: { accessToken: string; refreshToken: string; expiresAt: number }) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-copera-wiring-'))
  onTestFinished(() => rm(home, { recursive: true, force: true }))
  vi.stubEnv('DSH_COPERA_API_ORIGIN', api.origin)
  vi.stubEnv('DSH_COPERA_TOKEN', undefined)
  // Every mounted row is enabled (checked by mountedRows), so only id, builtin name, and config carry over.
  const rows = mountedRows().map(row => ({
    id: row.id,
    name: `cordis:${row.id}`,
    config: row.id === 'credentials' ? { path: join(home, 'credentials.yaml'), watch: false } : row.config,
  }))
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.baseUrl = 'file:///'
  await ctx.plugin(Loader).await()
  for (const [id, { module }] of Object.entries(MOUNTED)) ctx.loader.builtins[id] = module
  if (grant !== undefined) {
    // Seed the grant before the account service starts, through the same credentials document.
    await ctx.loader.root.update(rows.filter(row => row.id === 'credentials'))
    await ctx.loader.await()
    await new GrantStore(ctx, api.origin).write({ ...grant, account: null })
  }
  await ctx.loader.root.update(rows)
  await ctx.loader.await()
  expect(ctx.loader.resolve('copera-account').fiber?.uid).toBeDefined()
  return ctx
}

async function complete(ctx: Context): Promise<FinishReason> {
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({
    provider: 'copera',
    model: 'shikai',
    messages: [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })],
  })) assembler.push(chunk)
  return assembler.finish
}

describe('copera profile account and model wiring', () => {
  it('registers the copera route that agent-default-model names', async () => {
    const api = await startFakeCoperaApi()
    const ctx = await boot(api)
    const defaultModel = coperaProfileRows().find(row => row.id === 'agent-default-model')?.config
    expect(defaultModel).toEqual({ provider: 'copera', model: 'shikai' })
    expect((await ctx.llm.listModels('copera')).map(model => model.id)).toContain('shikai')
  })

  it('refreshes an expired grant once and sends the completion with the new access token', async () => {
    const api = await startFakeCoperaApi()
    const ctx = await boot(api, { accessToken: 'access-old', refreshToken: 'refresh-old', expiresAt: Date.now() - 1_000 })
    expect(await complete(ctx)).toEqual({ kind: 'stop' })
    expect(api.refreshes).toEqual(['refresh-old'])
    expect(api.completions).toEqual(['access-1'])
  })

  it('answers a Shikai 401 with one rejected-token refresh and one replay', async () => {
    const api = await startFakeCoperaApi()
    api.rejectTokens.add('access-live')
    const ctx = await boot(api, { accessToken: 'access-live', refreshToken: 'refresh-live', expiresAt: Date.now() + 3_600_000 })
    const refresh = vi.spyOn(GrantStore.prototype, 'refreshIfNeeded')
    expect(await complete(ctx)).toEqual({ kind: 'stop' })
    const rejected = refresh.mock.calls.filter(([options]) => options.rejectedToken !== undefined)
    expect(rejected.map(([options]) => options.rejectedToken)).toEqual(['access-live'])
    expect(api.refreshes).toEqual(['refresh-live'])
    expect(api.completions).toEqual(['access-live', 'access-1'])
  })

  it('fails AUTH without sending a request when there is no grant and no DSH_COPERA_TOKEN', async () => {
    const api = await startFakeCoperaApi()
    const ctx = await boot(api)
    const finish = await complete(ctx)
    expect(finish.kind).toBe('error')
    expect(finish.kind === 'error' ? finish.failure.code : undefined).toBe('AUTH')
    expect(api.refreshes).toEqual([])
    expect(api.completions).toEqual([])
  })
})
