/** The OAuth callback origin derived from the address the window was opened at. */
import { expect, it } from 'vitest'
import { loginOrigin } from '../src/client/login-origin.ts'

it.each([
  ['http://127.0.0.1:3080/', 'http://127.0.0.1:3080'],
  ['http://127.0.0.1:3080/sessions/abc?x=1#y', 'http://127.0.0.1:3080'],
  ['http://[::1]:43117/', 'http://[::1]:43117'],
  ['http://localhost:3080/', 'http://127.0.0.1:3080'],
  ['http://LOCALHOST:3186/', 'http://127.0.0.1:3186'],
])('accepts %s as callback origin %s', (address, origin) => {
  expect(loginOrigin(new URL(address))).toEqual({ origin })
})

it.each([
  'https://meu.host/',
  'http://meu.host:3080/',
  'http://192.168.1.20:3080/',
  'https://127.0.0.1:3080/',
  'http://127.0.0.1/',
  'http://localhost/',
  'copera-code://app/index.html',
])('refuses %s', (address) => {
  expect(loginOrigin(new URL(address))).toEqual({ unsupported: true })
})
