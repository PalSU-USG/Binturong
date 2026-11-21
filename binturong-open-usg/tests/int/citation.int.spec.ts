import { describe, expect, it } from 'vitest'

import { citation } from '@/records/citation'

describe('citation', () => {
  it('formats_the_record_citation_with_the_academic_year_series', () => {
    expect(
      citation({ typeLabel: 'Memorandum', documentNumber: '023', seriesLabel: '2026-2027' }),
    ).toBe('Memorandum No. 023, s. 2026-2027')
  })
  it('returns_null_when_the_number_or_academic_year_label_is_missing', () => {
    for (const documentNumber of [null, undefined, '', '  '])
      expect(
        citation({ typeLabel: 'Memorandum', documentNumber, seriesLabel: '2026-2027' }),
      ).toBeNull()
    for (const seriesLabel of [null, undefined, '', '  '])
      expect(citation({ typeLabel: 'Memorandum', documentNumber: '023', seriesLabel })).toBeNull()
  })
  it.each([
    ['No. 023', 'Memorandum No. 023, s. 2026-2027'],
    ['Memo No. 023', 'Memo No. 023, s. 2026-2027'],
  ])('keeps the number and avoids a duplicate prefix for %s', (documentNumber, expected) => {
    expect(citation({ typeLabel: 'Memorandum', documentNumber, seriesLabel: '2026-2027' })).toBe(
      expected,
    )
  })
})
