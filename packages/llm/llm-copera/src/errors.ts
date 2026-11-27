/**
 * Classification of Shikai's HTTP error responses. Shikai answers failures in
 * the OpenAI error envelope `{ error: { message, type, code } }`; quota
 * refusals add `x-should-retry: false` and rate limits add `retry-after`.
 * @module
 */
import type { BuiltinLlmFailureCode, LlmFailure } from '@deepseek-ai/dsh-llm'

/** Shikai failure category. */
export type ShikaiErrorKind = 'AUTH' | 'RATE_LIMIT' | 'QUOTA' | 'PERMISSION' | 'UPSTREAM'

/** Classified Shikai failure. */
export interface ShikaiErrorInfo {
  /** Failure category. */
  kind: ShikaiErrorKind
  /** Delay Shikai asked for before a retry, in milliseconds; present only for a usable `retry-after`. */
  retryAfterMs?: number
  /** Whether repeating the same request can succeed without user action. */
  retryable: boolean
  /** Locale key of the user-facing explanation, owned by the Copera account UI. */
  messageKey: string
}

/** One Shikai error as the fetch wrapper recorded it: a non-2xx response, or an error event inside a 200 stream. */
export interface ShikaiHttpFailure {
  /** HTTP status of the response; 200 for an error event inside an open stream. */
  status: number
  /** Whether the error arrived as a `data: {"error":…}` event inside an open stream. */
  inStream: boolean
  /** Response headers. */
  headers: Headers
  /** Parsed JSON body, or the raw text when it is not JSON. */
  body: unknown
}

const MESSAGE_KEYS: Readonly<Record<ShikaiErrorKind, string>> = {
  AUTH: 'copera.error.auth',
  RATE_LIMIT: 'copera.error.rateLimit',
  QUOTA: 'copera.error.quota',
  PERMISSION: 'copera.error.permission',
  UPSTREAM: 'copera.error.upstream',
}

/** Harness failure code each kind is reported under; UPSTREAM is chosen by status in {@link shikaiFailure}. */
const FAILURE_CODES: Readonly<Record<Exclude<ShikaiErrorKind, 'UPSTREAM'>, BuiltinLlmFailureCode>> = {
  AUTH: 'AUTH',
  // A token without the Shikai permission needs the same user action as a rejected one.
  PERMISSION: 'AUTH',
  RATE_LIMIT: 'RATE_LIMIT',
  QUOTA: 'QUOTA',
}

/** Read `error.code`, `error.type`, and `error.message` of an OpenAI error envelope. */
function envelopeFields(body: unknown): { code?: string; type?: string; message?: string } {
  if (typeof body !== 'object' || body === null || !('error' in body)) return {}
  const error = body.error
  if (typeof error !== 'object' || error === null) return {}
  const read = (key: string): string | undefined => {
    const value: unknown = Reflect.get(error, key)
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }
  const code = read('code')
  const type = read('type')
  const message = read('message')
  return {
    ...code === undefined ? {} : { code },
    ...type === undefined ? {} : { type },
    ...message === undefined ? {} : { message },
  }
}

/** Parse `retry-after` as delta seconds or an HTTP date; non-positive and unparsable values yield undefined. */
function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get('retry-after')?.trim()
  if (value === undefined || value.length === 0) return undefined
  const delay = /^\d+(?:\.\d+)?$/u.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now()
  return Number.isFinite(delay) && delay > 0 ? delay : undefined
}

/**
 * Classify one Shikai HTTP error response.
 * @param status - HTTP status of the response.
 * @param body - parsed response body, or its text when it is not JSON.
 * @param headers - response headers.
 * @returns the failure category, whether a retry can succeed, the provider-requested delay, and the message key.
 */
export function mapShikaiError(status: number, body: unknown, headers: Headers): ShikaiErrorInfo {
  const { code, type } = envelopeFields(body)
  const info = (kind: ShikaiErrorKind, retryable: boolean, delay?: number): ShikaiErrorInfo => ({
    kind,
    retryable,
    ...delay === undefined ? {} : { retryAfterMs: delay },
    messageKey: MESSAGE_KEYS[kind],
  })
  // Status decides for an HTTP failure; an error event inside an open stream has only its envelope.
  if (status === 401 || code === 'invalid_api_key') return info('AUTH', false)
  if (status === 403 || code === 'permission_denied' || type === 'permission_error') return info('PERMISSION', false)
  const noRetry = headers.get('x-should-retry')?.trim().toLowerCase() === 'false'
  if (status === 402 || code === 'insufficient_quota' || type === 'insufficient_quota' || (status === 429 && noRetry)) {
    return info('QUOTA', false)
  }
  if (status === 429 || code === 'rate_limit_exceeded' || type === 'rate_limit_error') {
    return info('RATE_LIMIT', true, retryAfterMs(headers))
  }
  return info('UPSTREAM', (status >= 500 || type === 'server_error') && !noRetry, retryAfterMs(headers))
}

/**
 * The harness failure for a Shikai error, replacing pi-ai's flattened one.
 * QUOTA, AUTH, and PERMISSION use codes outside the default retryable set;
 * RATE_LIMIT carries Shikai's `retry-after` as `providerRetryAfterMs`, which
 * the route's retry policy honours. A retryable UPSTREAM failure reports
 * `SERVER`; any other UPSTREAM failure keeps pi-ai's own code. An in-stream
 * error carries no HTTP status.
 * @param response - the recorded error response or in-stream error event.
 * @param fallback - the failure pi-ai reported for the same request.
 * @returns the failure with Shikai's message, status, code, and delay.
 */
export function shikaiFailure(response: ShikaiHttpFailure, fallback: LlmFailure): LlmFailure {
  const info = mapShikaiError(response.status, response.body, response.headers)
  const message = envelopeFields(response.body).message ?? fallback.message
  let code: string
  if (info.kind !== 'UPSTREAM') code = FAILURE_CODES[info.kind]
  else code = info.retryable ? 'SERVER' satisfies BuiltinLlmFailureCode : fallback.code
  return {
    message,
    code,
    ...response.inStream ? {} : { status: response.status },
    ...info.retryAfterMs === undefined ? {} : { providerRetryAfterMs: info.retryAfterMs },
  }
}
