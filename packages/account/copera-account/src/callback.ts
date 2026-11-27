/**
 * Loopback OAuth callback listener on the Host web server. It runs in the `webserver/request` waterfall, before the
 * web server's own authentication, because the browser returning from Copera carries no Host credential; the
 * attempt's state, compared in constant time, is the only proof the request belongs to this sign-in.
 * @module
 */
import { timingSafeEqual } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { CALLBACK_PATH } from './oauth.ts'

/** What the browser brought back: an authorization code, or an OAuth `error` code. */
export type CallbackOutcome = { readonly kind: 'code'; readonly code: string } | { readonly kind: 'error'; readonly error: string }

/** The attempt one listener serves. */
export interface CallbackAttempt {
  /** Loopback callback origin, such as `http://127.0.0.1:3080`; the request `Host` must equal its host. */
  readonly origin: string
  /** Random per-attempt state sent to Copera. */
  readonly state: string
  /** Whether the attempt still waits for the browser; false answers 410. */
  accepting(): boolean
  /**
   * Consume the callback. Called at most once per accepting period; the attempt must stop accepting synchronously.
   * @param outcome - code or error from the query string.
   * @returns how the attempt ended, which selects the page shown in the browser.
   */
  complete(outcome: CallbackOutcome): Promise<'signed-in' | 'denied' | 'failed'>
}

const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
} as const

/** Static pages; none of them includes any value from the request. */
const PAGES = {
  'signed-in': page('Signed in to Copera Code', 'You can close this tab and return to Copera Code.',
    'Você pode fechar esta aba e voltar ao Copera Code.'),
  denied: page('Sign-in cancelled', 'Sign-in was cancelled. You can close this tab and try again in Copera Code.',
    'O login foi cancelado. Você pode fechar esta aba e tentar novamente no Copera Code.'),
  failed: page('Sign-in failed', 'Sign-in failed. Close this tab and try again in Copera Code.',
    'O login falhou. Feche esta aba e tente novamente no Copera Code.'),
} as const

function page(title: string, english: string, portuguese: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>`
    + `<body><p>${english}</p><p lang="pt-BR">${portuguese}</p></body></html>`
}

function empty(res: ServerResponse, status: number, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers }).end()
}

function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Serve `GET /oauth/callback` for one attempt on the Host web server.
 * @param ctx - Context whose `webserver/request` waterfall receives the callback.
 * @param attempt - attempt identity, state, and completion.
 * @returns the disposer removing the listener.
 */
export function registerCallbackListener(ctx: Context, attempt: CallbackAttempt): () => void {
  const expectedHost = new URL(attempt.origin).host
  return ctx.on('webserver/request', async (req, res, next) => {
    let url: URL
    try { url = new URL(req.url ?? '/', attempt.origin) } catch (_invalidTarget) { await next(); return }
    if (url.pathname !== CALLBACK_PATH) { await next(); return }
    if ((req.headers.host ?? '').toLowerCase() !== expectedHost) { empty(res, 400); return }
    if (req.method !== 'GET') { empty(res, 405, { allow: 'GET' }); return }
    const states = url.searchParams.getAll('state')
    if (states.length !== 1 || !sameSecret(states[0] ?? '', attempt.state)) { empty(res, 400); return }
    const codes = url.searchParams.getAll('code')
    const errors = url.searchParams.getAll('error')
    if (codes.length + errors.length !== 1 || codes[0] === '') { empty(res, 400); return }
    if (!attempt.accepting()) { empty(res, 410); return }
    const [code] = codes
    const [error] = errors
    const outcome: CallbackOutcome = code === undefined ? { kind: 'error', error: error ?? '' } : { kind: 'code', code }
    const result = await attempt.complete(outcome)
    res.writeHead(200, PAGE_HEADERS).end(PAGES[result])
  })
}
