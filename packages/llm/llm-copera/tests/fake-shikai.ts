/** Local stand-in for Shikai's `/public/v1/chat/completions`, scripted per request. */
import { createServer } from 'node:http'
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'node:http'

/** One scripted answer. */
export type FakeAnswer =
  /** A complete non-stream response, typically an OpenAI error envelope. */
  | { status: number; headers?: Record<string, string>; body: unknown }
  /**
   * A 200 SSE response written as raw text, one string per write. `end`
   * selects how it stops: a normal end, a destroyed socket, or held open.
   */
  | { sse: string[]; end?: 'end' | 'destroy' | 'hold' }

/** One request the fake received. */
export interface FakeRequest {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: Record<string, unknown>
}

/** A running fake and what it saw. */
export interface FakeShikai {
  /** Base URL including `/public/v1`. */
  baseUrl: string
  requests: FakeRequest[]
}

const servers: Server[] = []

/** Close every fake opened since the last call; run from each spec's afterEach. */
export async function closeFakes(): Promise<void> {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => {
    server.close(() => { resolve() })
    server.closeAllConnections()
  })))
}

/**
 * Format one SSE `data:` event.
 * @param value - JSON payload, or the literal `[DONE]`.
 * @returns the framed event.
 */
export function data(value: unknown): string {
  return `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`
}

/**
 * Start a fake answering each request with the next scripted answer.
 * @param script - answers in request order; an exhausted script answers 500.
 * @returns the fake's base URL and request log.
 */
export async function fakeShikai(script: FakeAnswer[]): Promise<FakeShikai> {
  const requests: FakeRequest[] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      requests.push({
        method: request.method ?? '',
        path: request.url ?? '',
        headers: request.headers,
        body: text.length === 0 ? {} : JSON.parse(text) as Record<string, unknown>,
      })
      const answer = script.shift() ?? { status: 500, body: { error: { message: 'script exhausted' } } }
      if ('status' in answer) {
        response.writeHead(answer.status, { 'content-type': 'application/json', ...answer.headers })
        response.end(JSON.stringify(answer.body))
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
      response.flushHeaders()
      for (const piece of answer.sse) response.write(piece)
      if (answer.end === 'destroy') response.socket?.destroy()
      else if (answer.end !== 'hold') response.end()
    })
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fake Shikai has no port')
  return { baseUrl: `http://127.0.0.1:${address.port}/public/v1`, requests }
}
