// @vitest-environment jsdom
/** The pre-plugin boot splash names Copera Code in `copera` client builds and keeps the upstream wordmark elsewhere. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BootPage } from '@deepseek-ai/dsh-client-web/src/boot-page.ts'

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllEnvs()
})

function wordmark(): string | null | undefined {
  const el = document.createElement('div')
  document.body.append(el)
  const page = new BootPage(el)
  const text = el.firstElementChild?.firstElementChild?.firstElementChild?.textContent
  page.dispose()
  return text
}

describe('boot splash wordmark', () => {
  it('names Copera Code in the copera build profile', () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'copera')
    expect(wordmark()).toBe('COPERA CODE')
  })

  it('keeps the upstream wordmark in other build profiles', () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'local')
    expect(wordmark()).toBe('HARNESS')
  })
})
