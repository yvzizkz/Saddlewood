import { describe, it, expect } from 'vitest'
import { countActiveFlagged, isActiveFlagged } from '@/lib/estimates/flags'
import type { LineItem } from '@/lib/estimates/types'

function makeLineItem(overrides: Partial<LineItem> = {}): LineItem {
  return {
    id: 'li-1',
    trade_id: 't-1',
    description: '',
    area_location: null,
    quantity: 1,
    unit: null,
    material_unit_cost: 0,
    labor_unit_cost: 0,
    labor_hours_per_unit: null,
    total: 0,
    source_sheet: null,
    source_grid: null,
    dimension_type: null,
    confidence: null,
    flags: [],
    is_allowance: false,
    is_deleted: false,
    is_manual_override: false,
    sort_order: 0,
    ...overrides,
  }
}

describe('isActiveFlagged', () => {
  it('returns true for an item with at least one flag and not deleted', () => {
    expect(isActiveFlagged(makeLineItem({ flags: ['low_conf'] }))).toBe(true)
  })

  it('returns false for an unflagged item', () => {
    expect(isActiveFlagged(makeLineItem({ flags: [] }))).toBe(false)
  })

  it('returns false for a flagged but soft-deleted item', () => {
    expect(
      isActiveFlagged(makeLineItem({ flags: ['low_conf'], is_deleted: true }))
    ).toBe(false)
  })
})

describe('countActiveFlagged', () => {
  it('counts only flagged, non-deleted items', () => {
    const items = [
      makeLineItem({ id: 'a', flags: ['low_conf'] }),
      makeLineItem({ id: 'b', flags: [] }),
      makeLineItem({ id: 'c', flags: ['rfi'], is_deleted: true }),
      makeLineItem({ id: 'd', flags: ['low_conf', 'rfi'] }),
    ]
    expect(countActiveFlagged(items)).toBe(2)
  })

  it('returns 0 for an empty iterable', () => {
    expect(countActiveFlagged([])).toBe(0)
  })
})
