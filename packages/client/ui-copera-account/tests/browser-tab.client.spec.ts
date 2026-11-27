// @vitest-environment jsdom
/** The authorization page opens only from an HTTPS address, or plain HTTP on a literal loopback address. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserTab, isAuthorizeUrl } from '../src/client/browser-tab.ts'

afterEach(() => { vi.restoreAllMocks() })

describe('isAuthorizeUrl', () => {
  it.each(['https://api.copera.ai/oauth/authorize?x=1', 'http://127.0.0.1:9911/oauth/authorize', 'http://[::1]:9911/oauth/authorize'])(
    'accepts %s', (url) => { expect(isAuthorizeUrl(url)).toBe(true) })

  it.each(['javascript:alert(1)', 'http://api.copera.ai/oauth/authorize', 'http://localhost:9911/oauth', 'file:///etc/passwd',
    'data:text/html,x', 'not a url', 'http://10.0.0.1/oauth'])('refuses %s', (url) => { expect(isAuthorizeUrl(url)).toBe(false) })
})

describe('BrowserTab', () => {
  it('opens an accepted address and closes the prepared tab for a refused one', () => {
    const replace = vi.fn()
    const close = vi.fn()
    const tab = { closed: false, close, opener: {}, location: { replace } }
    const open = vi.spyOn(window, 'open').mockImplementation(() => tab as never)
    const browser = new BrowserTab(false)
    browser.prepare()
    browser.open('javascript:alert(1)')
    expect(replace).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledTimes(1)
    browser.prepare()
    browser.open('https://api.copera.ai/oauth/authorize')
    expect(replace).toHaveBeenCalledWith('https://api.copera.ai/oauth/authorize')
  })

  it('never opens a refused address directly in the desktop shell', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const browser = new BrowserTab(true)
    browser.open('file:///etc/passwd')
    expect(open).not.toHaveBeenCalled()
    browser.open('https://api.copera.ai/oauth/authorize')
    expect(open).toHaveBeenCalledWith('https://api.copera.ai/oauth/authorize', '_blank', 'noopener,noreferrer')
  })
})
