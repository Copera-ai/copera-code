import { request as httpRequest } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { registerCallbackListener, type CallbackAttempt, type CallbackOutcome } from '../src/callback.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => { while (cleanups.length > 0) await cleanups.pop()?.() })

const STATE = 'expected-state-value-0123456789'

async function fixture(result: 'signed-in' | 'denied' | 'failed' = 'signed-in') {
  const ctx = new Context()
  const web = ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await web
  cleanups.push(() => web.dispose())
  const origin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  let accepting = true
  const outcomes: CallbackOutcome[] = []
  const complete = vi.fn((outcome: CallbackOutcome) => {
    accepting = false
    outcomes.push(outcome)
    return Promise.resolve(result)
  })
  const attempt: CallbackAttempt = { origin, state: STATE, accepting: () => accepting, complete }
  const dispose = registerCallbackListener(ctx, attempt)
  cleanups.push(async () => { dispose() })
  return { ctx, origin, complete, outcomes, dispose, stopAccepting: () => { accepting = false } }
}

interface Reply { status: number | undefined; headers: Record<string, string | string[] | undefined>; body: string }

function send(origin: string, path: string, options: { method?: string; host?: string } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(new URL(path, origin), {
      method: options.method ?? 'GET', ...options.host === undefined ? {} : { headers: { host: options.host } },
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => { body += chunk })
      res.on('end', () => { resolve({ status: res.statusCode, headers: res.headers, body }) })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

it('completes with the code and answers a static page', async () => {
  const f = await fixture()
  const code = 'code-<script>alert(1)</script>'
  const reply = await send(f.origin, `/oauth/callback?code=${encodeURIComponent(code)}&state=${STATE}&extra=%3Cb%3Ereflected%3C%2Fb%3E`)
  expect(reply.status).toBe(200)
  expect(f.outcomes).toEqual([{ kind: 'code', code }])
  expect(reply.headers['content-type']).toBe('text/html; charset=utf-8')
  expect(reply.headers['cache-control']).toBe('no-store')
  expect(reply.headers['content-security-policy']).toMatch(/^default-src 'none'/)
  expect(reply.body).toContain('You can close this tab and return to Copera Code.')
  expect(reply.body).toContain('Copera Code')
  for (const value of [code, STATE, 'reflected', 'script', 'alert']) expect(reply.body).not.toContain(value)
})

it('rejects a wrong, missing, or repeated state and keeps waiting', async () => {
  const f = await fixture()
  expect((await send(f.origin, '/oauth/callback?code=c&state=wrong-state-value-0123456789x')).status).toBe(400)
  expect((await send(f.origin, '/oauth/callback?code=c')).status).toBe(400)
  expect((await send(f.origin, `/oauth/callback?code=c&state=${STATE}&state=${STATE}`)).status).toBe(400)
  expect((await send(f.origin, `/oauth/callback?code=c&code=d&state=${STATE}`)).status).toBe(400)
  expect((await send(f.origin, `/oauth/callback?state=${STATE}`)).status).toBe(400)
  expect(f.complete).not.toHaveBeenCalled()
  expect((await send(f.origin, `/oauth/callback?code=c&state=${STATE}`)).status).toBe(200)
})

it('rejects a request for another Host', async () => {
  const f = await fixture()
  const port = new URL(f.origin).port
  expect((await send(f.origin, `/oauth/callback?code=c&state=${STATE}`, { host: `localhost:${port}` })).status).toBe(400)
  expect((await send(f.origin, `/oauth/callback?code=c&state=${STATE}`, { host: 'attacker.invalid' })).status).toBe(400)
  expect(f.complete).not.toHaveBeenCalled()
})

it('rejects methods other than GET', async () => {
  const f = await fixture()
  expect((await send(f.origin, `/oauth/callback?code=c&state=${STATE}`, { method: 'POST' })).status).toBe(405)
  expect(f.complete).not.toHaveBeenCalled()
})

it('completes a declined consent as denied without reflecting the error text', async () => {
  const f = await fixture('denied')
  const reply = await send(f.origin, `/oauth/callback?error=access_denied&error_description=%3Ci%3Eevil%3C%2Fi%3E&state=${STATE}`)
  expect(reply.status).toBe(200)
  expect(f.outcomes).toEqual([{ kind: 'error', error: 'access_denied' }])
  expect(reply.body).not.toContain('evil')
  expect(reply.body).not.toContain('access_denied')
})

it('answers a failure page when the exchange fails', async () => {
  const f = await fixture('failed')
  const reply = await send(f.origin, `/oauth/callback?code=c&state=${STATE}`)
  expect(reply.status).toBe(200)
  expect(reply.body).not.toContain('You can close this tab and return to Copera Code.')
})

it('answers 410 once the attempt no longer waits for the browser', async () => {
  const f = await fixture()
  expect((await send(f.origin, `/oauth/callback?code=c&state=${STATE}`)).status).toBe(200)
  expect((await send(f.origin, `/oauth/callback?code=c&state=${STATE}`)).status).toBe(410)
  expect(f.complete).toHaveBeenCalledOnce()
})

it('passes other paths on and stops listening after disposal', async () => {
  const f = await fixture()
  expect((await send(f.origin, `/oauth/callback/x?code=c&state=${STATE}`)).status).not.toBe(200)
  f.dispose()
  expect((await send(f.origin, `/oauth/callback?code=c&state=${STATE}`)).status).not.toBe(200)
  expect(f.complete).not.toHaveBeenCalled()
})
