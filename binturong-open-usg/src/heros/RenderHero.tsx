import React from 'react'

import type { Page } from '@/payload-types'

import { HighImpactHero } from '@/heros/HighImpact'
import { LowImpactHero } from '@/heros/LowImpact'
import { MediumImpactHero } from '@/heros/MediumImpact'

const heroes = {
  highImpact: HighImpactHero,
  lowImpact: LowImpactHero,
  mediumImpact: MediumImpactHero,
}

export const RenderHero: React.FC<Page['hero']> = (props) => {
  const { type } = props || {}

  if (!type || type === 'none') return null

  const HeroToRender = heroes[type]

  if (!HeroToRender) return null

  // The page band owns h1; preserve authored hero content beneath it without mutating CMS data.
  const richText = props.richText && {
    ...props.richText,
    root: {
      ...props.richText.root,
      children: props.richText.root.children.map((node) =>
        (node as { type?: string; tag?: string }).type === 'heading' &&
        (node as { tag?: string }).tag === 'h1'
          ? { ...node, tag: 'h2' }
          : node,
      ),
    },
  }
  return <HeroToRender {...props} richText={richText} />
}
