/** Copera symbol and product name for the sidebar brand slots, the blank-home mark, and the sign-in screen mark. */
import clsx from 'clsx'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import symbolUrl from './assets/copera-symbol.svg'
import type {} from './locales.ts'
import css from './CoperaMark.module.css'

/** Mark presentation requested by the sidebar (`size`) or the blank home (`size`, `className`). */
export interface CoperaMarkProps {
  /** Square edge in pixels. */
  size: number
  /** Host class preserving the surrounding mark geometry. */
  className?: string | undefined
}

/**
 * Render the Copera symbol: the white mark on its blue gradient tile, legible on both palettes.
 * The image is decorative because every host places it beside or inside a labeled element.
 * @param props - requested edge and optional host class.
 * @returns the symbol image.
 */
export function CoperaMark({ size, className }: CoperaMarkProps) {
  return <img className={clsx(css.mark, className)} src={symbolUrl} width={size} height={size} alt="" draggable={false} />
}

/** Edge of the sign-in screen mark; matches the 28px brand row of the screen. */
const GATE_MARK_SIZE = 28

/**
 * Render the Copera symbol before the product name on the sign-in screen, which passes no size.
 * @returns the symbol image.
 */
export function CoperaGateMark() {
  return <CoperaMark size={GATE_MARK_SIZE} />
}

/** Translate seat of the brand-name occupant. */
export interface CoperaNameProps {
  /** Brand dictionary lookup. */
  t: TranslateNS<'brand.copera'>
}

/**
 * Render the localized product name beside the sidebar mark.
 * @param props - the brand dictionary lookup.
 * @returns the product name text.
 */
export function CoperaName({ t }: CoperaNameProps) {
  return <span className={css.name}>{t('name')}</span>
}
