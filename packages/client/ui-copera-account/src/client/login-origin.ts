/** The OAuth callback origin a window can offer to the Copera account service. */

/** A callback origin the service accepts, or the reason this window cannot sign in. */
export type LoginOrigin = { readonly origin: string } | { readonly unsupported: true }

/**
 * Derive the callback origin from the address the Host web server is reached at.
 * Copera registers only the literal loopback addresses, so `localhost` maps to `127.0.0.1` on the same port; the
 * callback then reaches the same server on that address.
 * @param location - page address in a browser, or the Host web server address inside the desktop shell.
 * @returns `http://127.0.0.1:<port>` or `http://[::1]:<port>`; `{ unsupported: true }` for HTTPS, another host, or an
 * address without an explicit port.
 */
export function loginOrigin(location: Pick<URL, 'protocol' | 'hostname' | 'port'>): LoginOrigin {
  if (location.protocol !== 'http:' || location.port === '') return { unsupported: true }
  const hostname = location.hostname.toLowerCase()
  if (hostname === '127.0.0.1' || hostname === '[::1]') return { origin: `http://${hostname}:${location.port}` }
  if (hostname === 'localhost') return { origin: `http://127.0.0.1:${location.port}` }
  return { unsupported: true }
}
