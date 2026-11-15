import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { generateMeta } from '@/utilities/generateMeta'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'

const root = path.resolve(__dirname, '../..')
const tokensPath = path.join(root, 'src/app/(frontend)/tokens.css')
const read = (file: string) => readFileSync(file, 'utf8')

function walk(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return walk(full, extensions)
    return extensions.some((ext) => name.endsWith(ext)) ? [full] : []
  })
}

// ---- color math (oklch -> sRGB -> WCAG contrast) -------------------------------------------

type RGB = [number, number, number]
function oklchToLinear(l: number, c: number, hDeg: number): RGB {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb: RGB = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  return rgb.map((v) => Math.min(1, Math.max(0, v))) as RGB
}
function hexToLinear(hex: string): RGB {
  return [0, 2, 4].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as RGB
}
/** Linear-light blend of `top` over `bottom` at `alpha` (what a translucent band looks like). */
const blend = (top: RGB, bottom: RGB, alpha: number): RGB =>
  top.map((v, i) => v * alpha + bottom[i] * (1 - alpha)) as RGB
const luminance =([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b
function contrast(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// ---- token resolution ---------------------------------------------------------------------

function declarations(css: string, selector: RegExp): Record<string, string> {
  const out: Record<string, string> = {}
  for (const block of css.matchAll(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, 'g'))) {
    for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  }
  return out
}

const css = read(tokensPath)
const light = declarations(css, /:root/)
const dark = { ...light, ...declarations(css, /\[data-theme='dark'\]/) }

function resolve(tokens: Record<string, string>, name: string, depth = 0): RGB {
  if (depth > 8) throw new Error(`Token cycle at ${name}`)
  const value = tokens[name]
  if (value === undefined) throw new Error(`Undefined token ${name}`)
  const ref = value.match(/^var\((--[\w-]+)\)$/)
  if (ref) return resolve(tokens, ref[1], depth + 1)
  const hex = value.match(/^#([0-9a-fA-F]{6})$/)
  if (hex) return hexToLinear(hex[1])
  const color = value.match(/^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/)
  if (!color) throw new Error(`Token ${name} is not an oklch color or var(): ${value}`)
  return oklchToLinear(Number(color[1]) / 100, Number(color[2]), Number(color[3]))
}

const statuses = ['info', 'warning', 'error', 'success']
// [foreground, background, minimum ratio]
const pairs: [string, string, number][] = [
  ['--foreground', '--background', 4.5],
  ['--card-foreground', '--card', 4.5],
  ['--popover-foreground', '--popover', 4.5],
  ['--muted-foreground', '--background', 4.5],
  ['--muted-foreground', '--card', 4.5],
  ['--muted-foreground', '--muted', 4.5],
  ['--link', '--background', 4.5],
  ['--link', '--card', 4.5],
  ['--primary-foreground', '--primary', 4.5],
  ['--secondary-foreground', '--secondary', 4.5],
  ['--accent-foreground', '--accent', 4.5],
  ['--on-brand', '--brand', 4.5],
  ['--on-brand', '--brand-deep', 4.5],
  ['--status-warning-fg', '--notice', 4.5],
  ['--accent-gold', '--background', 3],
  ['--brand', '--background', 3],
  ['--focus-ring', '--background', 3],
  ['--focus-ring', '--card', 3],
  ['--input', '--background', 3],
  // Inner-page identity band: yellow current-item bar on the rust side-nav panel.
  ['--notice', '--brand-deep', 3],
  ['--foreground', '--muted', 4.5],
  ['--primary', '--muted', 3],
  ...statuses.flatMap((s): [string, string, number][] => [
    [`--status-${s}-fg`, `--status-${s}-bg`, 4.5],
    [`--status-${s}-border`, '--background', 3],
  ]),
]

describe('semantic design tokens', () => {
  for (const [theme, tokens] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [fg, bg, min] of pairs) {
      it(`${theme}: ${fg} on ${bg} is at least ${min}:1`, () => {
        expect(contrast(resolve(tokens, fg), resolve(tokens, bg))).toBeGreaterThanOrEqual(min)
      })
    }
  }

  it('keeps brand values in one layer that semantic tokens map from', () => {
    expect(Object.keys(light).some((name) => name.startsWith('--brand-'))).toBe(true)
    expect(light['--link']).toMatch(/^var\(--brand/)
    expect(light['--primary']).toMatch(/^var\(--brand/)
  })

  it('carries the owner PalSU palette from Project Akademya in the brand layer', () => {
    expect(light['--brand'].toLowerCase()).toBe('#b4440c')
    expect(light['--accent-gold'].toLowerCase()).toBe('#bd8c0f')
    expect(light['--on-brand'].toLowerCase()).toBe('#fff6f6')
    expect(light['--brand-deep']).toBeDefined()
    expect(light['--notice']).toBeDefined()
    expect(light['--status-warning-bg']).toBe('var(--notice)')
    expect(css).toMatch(/Project Akademya[^*]*replace with approved originals/is)
  })

  it('keeps the hero text readable on the worst possible photo pixel', () => {
    const hero = read(path.join(root, 'src/components/home/HomePage.tsx'))
    const alpha = Number(hero.match(/bg-brand-deep\/(\d+)/)?.[1]) / 100
    expect(alpha).toBeGreaterThanOrEqual(0.85)
    for (const [theme, tokens] of [
      ['light', light],
      ['dark', dark],
    ] as const)
      for (const photo of [[1, 1, 1] as RGB, [0, 0, 0] as RGB]) {
        const band = blend(resolve(tokens, '--brand-deep'), photo, alpha)
        expect(contrast(resolve(tokens, '--on-brand'), band), theme).toBeGreaterThanOrEqual(4.5)
      }
  })

  it('declares the scale tokens the design guide asks for', () => {
    for (const name of [
      '--radius',
      '--measure',
      '--target-min',
      '--text-statement',
      '--text-page-title',
      '--text-section',
      '--text-record-title',
      '--text-body',
      '--text-meta',
      '--text-label',
      '--shadow-overlay',
    ])
      expect(light[name], name).toBeDefined()
    expect(light['--radius']).toBe('0.25rem')
    expect(light['--target-min']).toBe('2.75rem')
  })

  it('maps every semantic color token to a Tailwind color in @theme', () => {
    const globals = read(path.join(root, 'src/app/(frontend)/globals.css'))
    const theme = globals.slice(globals.indexOf('@theme inline'))
    const semantic = Object.keys(light)
      .filter((name) =>
        /^--(status-|link$|focus-ring$|brand$|brand-deep$|accent-gold$|on-brand$|notice$)/.test(name),
      )
      .map((name) => name.slice(2))
    for (const name of semantic)
      expect(theme, `--color-${name}`).toMatch(new RegExp(`--color-${name}:\\s*var\\(--${name}\\)`))
  })

  it('uses only color utilities that exist in @theme within the home components', () => {
    const globals = read(path.join(root, 'src/app/(frontend)/globals.css'))
    const used = new Set<string>()
    for (const file of walk(path.join(root, 'src/components/home'), ['.tsx']))
      for (const m of read(file).matchAll(
        /\b(?:bg|text|border)-((?:status-[a-z]+-(?:bg|fg|border))|link|focus-ring|brand-deep|brand|on-brand|accent-gold|notice)\b/g,
      ))
        used.add(m[1])
    expect(used.size).toBeGreaterThan(0)
    for (const name of used) expect(globals, `--color-${name}`).toContain(`--color-${name}:`)
  })
  it('never defines a variable that nothing resolves (no --text)', () => {
    expect(light['--text']).toBeUndefined()
  })

  it('has no var(--x) in CSS, scripts or Tailwind config without a definition', () => {
    const files = [
      ...walk(path.join(root, 'src'), ['.css', '.scss', '.ts', '.tsx', '.js', '.mjs']),
      path.join(root, 'tailwind.config.mjs'),
    ]
    const defined = new Set<string>()
    for (const file of files.filter((f) => /\.s?css$/.test(f)))
      for (const m of read(file).matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1])
    // Tailwind internals, next/font, the Radix select primitive and the Payload admin theme
    // (--theme-*, --base, used by admin SCSS) define their own variables.
    const external = /^--(tw-|font-geist-|font-league-|radix-|theme-|base$)/
    const missing: string[] = []
    for (const file of files)
      for (const m of read(file).matchAll(/var\((--[\w-]+)/g))
        if (!defined.has(m[1]) && !external.test(m[1]))
          missing.push(`${path.relative(root, file)}: ${m[1]}`)
    expect(missing).toEqual([])
  })

  it('has no raw colors in component class strings beyond the recorded inherited files', () => {
    // Inherited from the Payload template or owned by the navigation slice. New files must not
    // join this list; a real palette replaces these when brand inputs arrive.
    const inherited = new Set([
      'src/components/AdminBar/index.tsx',
      'src/blocks/Code/Component.client.tsx',
      'src/blocks/Form/Error/index.tsx',
      'src/heros/HighImpact/index.tsx',
      'src/heros/PostHero/index.tsx',
    ])
    const raw =
      /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(|hsla?\(|\[#|\b(?:bg|text|border|from|to|via)-(?:black|white|red|green|blue|yellow|gray|slate|zinc|neutral)\b/
    const offenders = [
      ...walk(path.join(root, 'src/components'), ['.tsx']),
      ...walk(path.join(root, 'src/blocks'), ['.tsx']),
      ...walk(path.join(root, 'src/heros'), ['.tsx']),
      ...walk(path.join(root, 'src/Header'), ['.tsx']),
      ...walk(path.join(root, 'src/Footer'), ['.tsx']),
    ]
      .map((file) => path.relative(root, file).replaceAll('\\', '/'))
      .filter((file) => raw.test(read(path.join(root, file))) && !inherited.has(file))
    expect(offenders).toEqual([])
  })
})

describe('public identity metadata', () => {
  it('names no Payload brand and ships no template image', async () => {
    const og = mergeOpenGraph()
    expect(JSON.stringify(og)).not.toMatch(/payload/i)
    expect(og?.images).toBeUndefined()
    const meta = await generateMeta({ doc: null })
    expect(JSON.stringify(meta)).not.toMatch(/payload|website-template/i)
  })

  it('keeps the layout metadata free of the template creator and brand', () => {
    const layout = read(path.join(root, 'src/app/(frontend)/layout.tsx'))
    expect(layout).not.toMatch(/payloadcms|Payload Website/i)
    expect(layout).not.toMatch(/creator/)
  })

  it('has no Payload template title left outside the seeded starter content', () => {
    // `/home` and `homeStatic` stay as they are until the owner decides (src/endpoints/seed).
    const offenders = walk(path.join(root, 'src'), ['.ts', '.tsx'])
      .map((file) => path.relative(root, file).replaceAll('\\', '/'))
      .filter((file) => !file.startsWith('src/endpoints/seed/'))
      .filter((file) => /Payload Website Template/.test(read(path.join(root, file))))
    expect(offenders).toEqual([])
  })

  it('does not suffix a stored SEO title that generateMeta suffixes again', () => {
    const plugins = read(path.join(root, 'src/plugins/index.ts'))
    const generateTitle = plugins.slice(
      plugins.indexOf('const generateTitle'),
      plugins.indexOf('const generateURL'),
    )
    // Not the Post | Page generic: no string literal may contain a separator.
    expect(generateTitle).not.toMatch(/(['`\"])[^'`\"\n]*\|[^'`\"\n]*\1/)
  })
  it('no longer ships the remote Payload logo component', () => {
    expect(() => statSync(path.join(root, 'src/components/Logo/Logo.tsx'))).toThrow()
  })
})
