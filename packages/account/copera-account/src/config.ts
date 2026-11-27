/**
 * Origins the Copera account accepts. The API origin comes only from `DSH_COPERA_API_ORIGIN`: the launcher sets or
 * clears it from the real environment, and the harness protects `DSH_*` names from a project `.env`.
 * @module
 */

/** Production Copera API origin. */
export const DEFAULT_API_ORIGIN = 'https://api.copera.ai'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]'])

/** A configured origin or a requested callback origin was refused. */
export class CoperaOriginError extends Error {
  override readonly name = 'CoperaOriginError'
}

/**
 * Resolve the Copera API origin that receives authorization codes and tokens.
 * @param value - `DSH_COPERA_API_ORIGIN`, or undefined for production.
 * @returns the normalized origin: HTTPS, or HTTP only on a loopback address for a local test server.
 * @throws CoperaOriginError for credentials, a path, query, fragment, or plain HTTP to a non-loopback host.
 */
export function resolveApiOrigin(value: string | undefined): string {
  const raw = value === undefined || value === '' ? DEFAULT_API_ORIGIN : value
  let url: URL
  try { url = new URL(raw) } catch (_invalid) { throw new CoperaOriginError('DSH_COPERA_API_ORIGIN is not a URL') }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
  if (!secure || url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new CoperaOriginError('DSH_COPERA_API_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment')
  }
  return url.origin
}

/**
 * Validate the browser-reachable origin of the Host web server that receives the OAuth callback.
 * @param value - origin the UI is served from, such as `http://127.0.0.1:3080`.
 * @returns the normalized origin.
 * @throws CoperaOriginError unless it is `http:` on `127.0.0.1` or `[::1]` with an explicit nonzero port and nothing
 * else; `localhost` is refused because Copera registers only the literal loopback addresses.
 */
export function resolveCallbackOrigin(value: string): string {
  const port = /^http:\/\/(?:127\.0\.0\.1|\[::1\]):([0-9]{1,5})\/?$/.exec(value)?.[1]
  let url: URL
  try { url = new URL(value) } catch (_invalid) { throw new CoperaOriginError('callback origin is not a URL') }
  if (port === undefined || Number(port) === 0 || Number(port) > 65_535 || url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new CoperaOriginError('callback origin must be http://127.0.0.1:<port> or http://[::1]:<port>')
  }
  return `http://${url.hostname}:${String(Number(port))}`
}
