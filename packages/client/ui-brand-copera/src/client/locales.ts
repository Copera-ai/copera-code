/** Brand copy owned by this package. The product name is not translated. */

/** Chinese dictionary; a copy of English because Copera Code does not offer Chinese. */
export const zh = {
  name: 'Copera Code',
} as const

/** Brand dictionary keys. */
export type BrandKey = keyof typeof zh

/** English dictionary. */
export const en: Record<BrandKey, string> = { name: 'Copera Code' }
/** Japanese dictionary. */
export const ja: Record<BrandKey, string> = { name: 'Copera Code' }
/** Spanish dictionary. */
export const es: Record<BrandKey, string> = { name: 'Copera Code' }
/** French dictionary. */
export const fr: Record<BrandKey, string> = { name: 'Copera Code' }
/** German dictionary. */
export const de: Record<BrandKey, string> = { name: 'Copera Code' }
/** Russian dictionary. */
export const ru: Record<BrandKey, string> = { name: 'Copera Code' }
/** Portuguese (Brazil) dictionary. */
export const pt: Record<BrandKey, string> = { name: 'Copera Code' }

/** Namespace of the brand dictionary. */
export const BRAND_NS = 'brand.copera'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copera Code brand copy. */
    'brand.copera': BrandKey
  }
}
