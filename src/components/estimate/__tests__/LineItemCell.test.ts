import { describe, expect, it } from 'vitest'
import { coerceCellValue } from '@/components/estimate/LineItemCell'

describe('coerceCellValue', () => {
  it('returns the trimmed string draft for text fields', () => {
    expect(coerceCellValue('text', 'east wall', '')).toBe('east wall')
    expect(coerceCellValue('text', '', 'prev')).toBe('')
  })

  it('parses numeric draft for number fields', () => {
    expect(coerceCellValue('number', '12.5', 0)).toBe(12.5)
    expect(coerceCellValue('number', '0', 99)).toBe(0)
  })

  it('falls back to the supplied numeric fallback when draft is unparseable', () => {
    expect(coerceCellValue('number', 'abc', 7)).toBe(7)
    expect(coerceCellValue('number', '', 7)).toBe(7)
  })

  it('falls back to 0 when number fallback is a string (defensive)', () => {
    // The component supplies the entered-from value as fallback; if a text
    // field somehow had a string seed and the type is number, we keep
    // numbers numeric.
    expect(coerceCellValue('number', 'abc', 'oops')).toBe(0)
  })

  it('does not strip whitespace from text fields', () => {
    expect(coerceCellValue('text', '  spaces  ', '')).toBe('  spaces  ')
  })
})
