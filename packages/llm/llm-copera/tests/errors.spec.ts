import { describe, expect, it } from 'vitest'
import { mapShikaiError, shikaiFailure } from '../src/errors.ts'

const envelope = (code: string, type = code) => ({ error: { message: 'm', type, code } })

describe('mapShikaiError', () => {
  it('classifies 401 as non-retryable AUTH', () => {
    expect(mapShikaiError(401, envelope('invalid_api_key', 'invalid_request_error'), new Headers()))
      .toEqual({ kind: 'AUTH', retryable: false, messageKey: 'copera.error.auth' })
  })

  it('classifies 403 as non-retryable PERMISSION', () => {
    expect(mapShikaiError(403, envelope('permission_denied', 'permission_error'), new Headers()))
      .toEqual({ kind: 'PERMISSION', retryable: false, messageKey: 'copera.error.permission' })
  })

  it('classifies insufficient_quota as non-retryable QUOTA even when retry-after is present', () => {
    const headers = new Headers({ 'x-should-retry': 'false', 'retry-after': '30' })
    expect(mapShikaiError(429, envelope('insufficient_quota'), headers))
      .toEqual({ kind: 'QUOTA', retryable: false, messageKey: 'copera.error.quota' })
  })

  it('classifies a 429 that forbids retries as QUOTA', () => {
    expect(mapShikaiError(429, envelope('something_else'), new Headers({ 'x-should-retry': 'false' })).kind).toBe('QUOTA')
  })

  it('classifies rate_limit_exceeded as retryable RATE_LIMIT honoring retry-after seconds', () => {
    expect(mapShikaiError(429, envelope('rate_limit_exceeded', 'rate_limit_error'), new Headers({ 'retry-after': '2' })))
      .toEqual({ kind: 'RATE_LIMIT', retryable: true, retryAfterMs: 2000, messageKey: 'copera.error.rateLimit' })
  })

  it('reads an HTTP-date retry-after and ignores an unusable one', () => {
    const later = new Date(Date.now() + 60_000).toUTCString()
    const dated = mapShikaiError(429, envelope('rate_limit_exceeded'), new Headers({ 'retry-after': later }))
    expect(dated.retryAfterMs).toBeGreaterThan(50_000)
    expect(mapShikaiError(429, undefined, new Headers({ 'retry-after': 'soon' }))).toEqual({
      kind: 'RATE_LIMIT', retryable: true, messageKey: 'copera.error.rateLimit',
    })
  })

  it('classifies server failures as retryable UPSTREAM and client failures as non-retryable UPSTREAM', () => {
    expect(mapShikaiError(503, envelope('shikai_unavailable', 'server_error'), new Headers()))
      .toEqual({ kind: 'UPSTREAM', retryable: true, messageKey: 'copera.error.upstream' })
    expect(mapShikaiError(400, 'not json', new Headers()))
      .toEqual({ kind: 'UPSTREAM', retryable: false, messageKey: 'copera.error.upstream' })
  })

  it('classifies a server failure with x-should-retry: false as non-retryable and reports a non-retryable code', () => {
    const headers = new Headers({ 'x-should-retry': 'false' })
    expect(mapShikaiError(503, envelope('shikai_unavailable', 'server_error'), headers))
      .toEqual({ kind: 'UPSTREAM', retryable: false, messageKey: 'copera.error.upstream' })
    const failure = shikaiFailure({ status: 503, inStream: false, headers, body: envelope('shikai_unavailable', 'server_error') },
      { code: 'SERVER', message: 'pi-ai' })
    expect(failure.code).toBe('HTTP_503')
  })

  it('classifies an in-stream error event by its envelope alone', () => {
    const none = new Headers()
    expect(mapShikaiError(200, envelope('insufficient_quota'), none).kind).toBe('QUOTA')
    expect(mapShikaiError(200, envelope('rate_limit_exceeded', 'rate_limit_error'), none)).toEqual({
      kind: 'RATE_LIMIT', retryable: true, messageKey: 'copera.error.rateLimit',
    })
    expect(mapShikaiError(200, envelope('permission_denied', 'permission_error'), none).kind).toBe('PERMISSION')
    expect(mapShikaiError(200, envelope('upstream_error', 'server_error'), none)).toEqual({
      kind: 'UPSTREAM', retryable: true, messageKey: 'copera.error.upstream',
    })
  })
})
