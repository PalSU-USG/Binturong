import { describe, expect, it } from 'vitest'

import { normalizeIdentifier } from '@/search/identifier'
import { isRecent, parseSearchParams } from '@/search/params'
import { indexedCollections, liveCollections, searchCanonicalPath } from '@/search/searchTargets'

describe('normalizeIdentifier', () => {
  it('ignores case, spaces and punctuation', () => {
    const key = normalizeIdentifier('Res. No. 2026-014')
    expect(key).toBe('resno2026014')
    expect(normalizeIdentifier('res no 2026014')).toBe(key)
    expect(normalizeIdentifier('RES-NO-2026/014')).toBe(key)
  })

  it('collapses each reviewed prefix alias to one canonical form', () => {
    expect(normalizeIdentifier('Resolution No. 2026-014')).toBe(
      normalizeIdentifier('Res. No. 2026-014'),
    )
    expect(normalizeIdentifier('Executive Order 12')).toBe(normalizeIdentifier('EO 12'))
    expect(normalizeIdentifier('Executive Order 12')).toBe('eo12')
    expect(normalizeIdentifier('Memorandum 3')).toBe(normalizeIdentifier('Memo 3'))
  })

  it('only maps aliases at the start and keeps unrelated prefixes apart', () => {
    expect(normalizeIdentifier('Act 12')).toBe('act12')
    expect(normalizeIdentifier('Research 12')).toBe('research12')
    expect(normalizeIdentifier('Annual Resolution 12')).toBe('annualresolution12')
    expect(normalizeIdentifier('EO 12')).not.toBe(normalizeIdentifier('Act 12'))
  })

  it('normalizes unicode composition', () => {
    expect(normalizeIdentifier('Caf\u0065\u0301 1')).toBe(normalizeIdentifier('Caf\u00e9 1'))
  })

  it('yields no key for empty or markup-only input', () => {
    expect(normalizeIdentifier('')).toBe('')
    expect(normalizeIdentifier('  -- . ')).toBe('')
    expect(normalizeIdentifier('<b></b>')).toBe('')
    expect(normalizeIdentifier(null)).toBe('')
    expect(normalizeIdentifier(undefined)).toBe('')
  })
})

describe('parseSearchParams', () => {
  const parse = (raw: Record<string, string | string[] | undefined>) => parseSearchParams(raw)

  it('uses defaults for missing values', () => {
    expect(parse({})).toEqual({ q: null, type: 'all', page: 1 })
  })

  it('reads the first value of a repeated parameter', () => {
    expect(parse({ q: ['alpha', 'beta'] }).q).toBe('alpha')
    expect(parse({ q: [] }).q).toBeNull()
    expect(parse({ type: ['reports', 'updates'] }).type).toBe('reports')
  })

  it('treats empty, whitespace and one-character queries as the prompt state', () => {
    expect(parse({ q: '' }).q).toBeNull()
    expect(parse({ q: '   ' }).q).toBeNull()
    expect(parse({ q: 'a' }).q).toBeNull()
    expect(parse({ q: ' a ' }).q).toBeNull()
    expect(parse({ q: 'ab' }).q).toBe('ab')
  })

  it('limits the query to 100 characters', () => {
    expect(parse({ q: 'a'.repeat(101) }).q).toBe('a'.repeat(100))
    expect(Array.from(parse({ q: '\u{1F600}'.repeat(150) }).q ?? '')).toHaveLength(100)
  })

  it('collapses whitespace and normalizes to NFC', () => {
    expect(parse({ q: '  student \t\n  council  ' }).q).toBe('student council')
    expect(parse({ q: 'Caf\u0065\u0301' }).q).toBe('Caf\u00e9')
  })

  it('removes like wildcards but keeps other text', () => {
    expect(parse({ q: '%' }).q).toBeNull()
    expect(parse({ q: '50%_off\\x' }).q).toBe('50offx')
    expect(parse({ q: '<script>alert(1)</script>' }).q).toBe('<script>alert(1)</script>')
    expect(parse({ q: 'a&b #c' }).q).toBe('a&b #c')
  })

  it('maps an unknown type to all', () => {
    expect(parse({ type: 'updates' }).type).toBe('updates')
    expect(parse({ type: 'issuances' }).type).toBe('issuances')
    expect(parse({ type: 'reports' }).type).toBe('reports')
    expect(parse({ type: 'documents' }).type).toBe('all')
    expect(parse({ type: 'REPORTS' }).type).toBe('all')
    expect(parse({ type: '' }).type).toBe('all')
  })

  it('accepts only positive integer pages', () => {
    expect(parse({ page: '3' }).page).toBe(3)
    for (const bad of [
      '0',
      '-1',
      '1.5',
      'abc',
      '',
      '1e3',
      '99999999999999999999',
      ' 2',
      '+2',
      '0x2',
    ])
      expect(parse({ page: bad }).page, bad).toBe(1)
    expect(parse({ page: ['4', '5'] }).page).toBe(4)
  })
})

describe('isRecent', () => {
  const now = new Date('2026-11-09T00:00:00.000Z')
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

  it('is true up to 30 days and false after', () => {
    expect(isRecent(daysAgo(0), now)).toBe(true)
    expect(isRecent(daysAgo(29), now)).toBe(true)
    expect(isRecent(daysAgo(30), now)).toBe(true)
    expect(isRecent(daysAgo(31), now)).toBe(false)
  })

  it('honors a custom window', () => {
    expect(isRecent(daysAgo(8), now, 7)).toBe(false)
    expect(isRecent(daysAgo(6), now, 7)).toBe(true)
  })

  it('is false for missing, invalid or future dates', () => {
    expect(isRecent(null, now)).toBe(false)
    expect(isRecent(undefined, now)).toBe(false)
    expect(isRecent('not a date', now)).toBe(false)
    expect(isRecent(daysAgo(-1), now)).toBe(false)
  })
})

describe('search targets', () => {
  it('indexes posts, issuances and reports and only posts are live', () => {
    expect([...indexedCollections].sort()).toEqual(['issuances', 'posts', 'reports'])
    expect([...liveCollections]).toEqual(['posts'])
  })

  it('builds encoded canonical paths', () => {
    expect(searchCanonicalPath('posts', 'hello-world')).toBe('/posts/hello-world')
    expect(searchCanonicalPath('issuances', 'res-1')).toBe('/issuances/res-1')
    expect(searchCanonicalPath('reports', 'q1')).toBe('/reports/q1')
    expect(searchCanonicalPath('posts', 'a b/../c?d#e%')).toBe('/posts/a%20b%2F..%2Fc%3Fd%23e%25')
  })

  it('throws for unregistered collections and empty slugs', () => {
    expect(() => searchCanonicalPath('documents', 'x')).toThrow()
    expect(() => searchCanonicalPath('constructor', 'x')).toThrow()
    expect(() => searchCanonicalPath('posts', '')).toThrow()
  })
})
