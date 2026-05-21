import { describe, expect, it } from 'vitest'
import { sanitizeDecimalInput } from '@/components/estimate/NumericBottomSheet'

describe('sanitizeDecimalInput', () => {
  it('strips non-numeric characters', () => {
    expect(sanitizeDecimalInput('$123.45')).toBe('123.45')
    expect(sanitizeDecimalInput('1,234.56')).toBe('1234.56')
    expect(sanitizeDecimalInput('abc')).toBe('')
  })

  it('preserves a single decimal point', () => {
    expect(sanitizeDecimalInput('1.5')).toBe('1.5')
    expect(sanitizeDecimalInput('0.001')).toBe('0.001')
  })

  it('collapses multiple decimal points into one (keeps everything after the first)', () => {
    expect(sanitizeDecimalInput('1.5.3')).toBe('1.53')
    expect(sanitizeDecimalInput('..')).toBe('.')
  })

  it('handles empty input', () => {
    expect(sanitizeDecimalInput('')).toBe('')
  })

  it('allows leading or trailing decimal', () => {
    expect(sanitizeDecimalInput('.5')).toBe('.5')
    expect(sanitizeDecimalInput('5.')).toBe('5.')
  })
})
