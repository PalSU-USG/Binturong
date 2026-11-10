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
const luminance = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b
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
  ['--focus-ring', '--background', 3],
  ['--focus-ring', '--card', 3],
  ['--input', '--background', 3],
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
    expect(light['--link']).toMatch(/^var\(--brand-/)
    expect(light['--primary']).toMatch(/^var\(--brand-/)
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
    // Tailwind internals, next/font and the Radix select primitive define their own variables.
    const external = /^--(tw-|font-geist-|radix-)/
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
      'src/Footer/Component.tsx',
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

  it('no longer ships the remote Payload logo component', () => {
    expect(() => statSync(path.join(root, 'src/components/Logo/Logo.tsx'))).toThrow()
  })
})
