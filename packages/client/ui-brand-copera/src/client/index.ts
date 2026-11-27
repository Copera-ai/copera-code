/**
 * Copera Code browser brand: occupies the sidebar brand slots, the blank-home
 * mark and frame layer, the sign-in screen mark, stacks the Copera token layer with the bundled Inter
 * face, and overrides upstream product-name copy in English and Portuguese.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-copera-account/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { CoperaHeroFrame } from './CoperaHeroFrame.tsx'
import { installInterFace } from './fonts/inter-face.ts'
import { CoperaGateMark, CoperaMark, CoperaName } from './CoperaMark.tsx'
import { LOCALE_OVERRIDES } from './locale-overrides.ts'
import { BRAND_NS, de, en, es, fr, ja, pt, ru, zh } from './locales.ts'
import { COPERA_THEME_SOURCE, COPERA_THEME_TOKENS } from './theme.ts'

/** Required services: slot registry, theme runtime, and locale registry. */
export const inject = ['slots', 'theme', 'locale']

/**
 * Install the Copera Code brand for the plugin lifetime.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(BRAND_NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-brand-copera: brand dictionaries')
  for (const [ns, languages] of Object.entries(LOCALE_OVERRIDES)) {
    for (const [language, entries] of Object.entries(languages)) {
      ctx.effect(() => ctx.locale.override(ns, language, entries), `ui-brand-copera: ${ns} ${language} overrides`)
    }
  }
  ctx.effect(() => installInterFace(document), 'ui-brand-copera: Inter face')
  ctx.effect(() => ctx.theme.overrideTokens(COPERA_THEME_SOURCE, COPERA_THEME_TOKENS), 'ui-brand-copera: token layer')
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, CoperaMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name', locale: BRAND_NS }, CoperaName)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({ name: 'conversation.hero.brand.mark' }, CoperaMark))
  ctx.slots.inject('copera-account.gate.mark', () => ctx.slots.register({ name: 'copera-account.gate.mark' }, CoperaGateMark))
  ctx.slots.inject('conversation.hero.frame', () => ctx.slots.register({
    name: 'conversation.hero.frame',
    id: 'copera-hero',
  }, CoperaHeroFrame))
}
