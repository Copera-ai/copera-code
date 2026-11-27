/** Blank-home frame layer: a soft Copera-blue glow behind the hero, below all Conversation content. */
import type { ReactNode } from 'react'
import type { HeroFrameOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './CoperaHeroFrame.module.css'

/** Frame owner state and the wrapped scroll body. */
export type CoperaHeroFrameProps = HeroFrameOwnerProps & { children: ReactNode }

/**
 * Wrap the Conversation scroll body; while the blank home shows, paint the glow layer.
 * @param props - the home state and the wrapped scroll body.
 * @returns a layout-neutral frame around the children.
 */
export function CoperaHeroFrame({ hero, children }: CoperaHeroFrameProps) {
  return (
    <div className={css.layer}>
      {hero && <div className={css.glow} data-copera-hero="" aria-hidden="true" />}
      {children}
    </div>
  )
}
