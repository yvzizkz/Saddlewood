import { describe, expect, it, vi } from 'vitest'
import { flushDirty } from '@/hooks/useAutosave'
import type { LineItem } from '@/lib/estimates/types'

function makeLineItem(overrides: Partial<LineItem> = {}): LineItem {
  return {
    id: 'li-1',
    trade_id: 't-1',
    description: 'Test',
    area_location: null,
    quantity: 10,
    unit: null,
    material_unit_cost: 1,
    labor_unit_cost: 2,
    labor_hours_per_unit: null,
    total: 30,
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

function makeFetchOk(): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
  } as Response) as unknown as typeof fetch
}

describe('flushDirty', () => {
  it('is a no-op when given empty ids', async () => {
    const fetchFn = vi.fn()
    const result = await flushDirty({
      estimateId: 'e-1',
      ids: [],
      getCurrentItem: () => undefined,
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    expect(result).toEqual({ cleanIds: [], failedIds: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('PATCHes each id and reports cleanIds when nothing changed during save', async () => {
    const items: Record<string, LineItem> = {
      'li-1': makeLineItem({ id: 'li-1', quantity: 10 }),
      'li-2': makeLineItem({ id: 'li-2', quantity: 20 }),
    }
    const fetchFn = makeFetchOk()

    const result = await flushDirty({
      estimateId: 'e-1',
      ids: ['li-1', 'li-2'],
      getCurrentItem: (id) => items[id],
      fetchFn,
    })

    expect(result.cleanIds.sort()).toEqual(['li-1', 'li-2'])
    expect(result.failedIds).toEqual([])
    expect(fetchFn).toHaveBeenCalledTimes(2)

    // First call: PATCH /api/estimates/e-1/line-items/li-1
    const call1 = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call1[0]).toBe('/api/estimates/e-1/line-items/li-1')
    expect((call1[1] as RequestInit).method).toBe('PATCH')
    const body1 = JSON.parse(String((call1[1] as RequestInit).body))
    expect(body1.quantity).toBe(10)
    expect(body1.description).toBe('Test')
    expect(body1.area_location).toBeNull()
  })

  it('keeps an id dirty (not in cleanIds) when its value changes during the PATCH', async () => {
    // Simulate: fetch resolves after we mutate the item.
    let postFetchSnapshot = makeLineItem({ id: 'li-1', quantity: 10 })
    let resolveFetch!: () => void
    const fetchFn = vi.fn(() => {
      // Mutate the "live" item to a new quantity right before the fetch resolves.
      postFetchSnapshot = makeLineItem({ id: 'li-1', quantity: 999 })
      return new Promise<Response>((res) => {
        resolveFetch = () => res({ ok: true, status: 200 } as Response)
      })
    }) as unknown as typeof fetch

    const promise = flushDirty({
      estimateId: 'e-1',
      ids: ['li-1'],
      getCurrentItem: () => postFetchSnapshot,
      fetchFn,
    })
    // Trigger the resolution.
    resolveFetch()
    const result = await promise

    expect(result.cleanIds).toEqual([])
    expect(result.failedIds).toEqual([])
  })

  it('reports failedIds when a PATCH returns non-2xx', async () => {
    const items: Record<string, LineItem> = {
      'li-1': makeLineItem({ id: 'li-1' }),
      'li-2': makeLineItem({ id: 'li-2' }),
    }
    let callIndex = 0
    const fetchFn = vi.fn(() => {
      const ok = callIndex === 0
      callIndex++
      return Promise.resolve({ ok, status: ok ? 200 : 500 } as Response)
    }) as unknown as typeof fetch

    const result = await flushDirty({
      estimateId: 'e-1',
      ids: ['li-1', 'li-2'],
      getCurrentItem: (id) => items[id],
      fetchFn,
    })

    expect(result.cleanIds).toEqual(['li-1'])
    expect(result.failedIds).toEqual(['li-2'])
  })

  it('reports failedIds when a PATCH rejects (network error)', async () => {
    const items: Record<string, LineItem> = {
      'li-1': makeLineItem({ id: 'li-1' }),
    }
    const fetchFn = vi.fn().mockRejectedValue(
      new TypeError('Failed to fetch')
    ) as unknown as typeof fetch

    const result = await flushDirty({
      estimateId: 'e-1',
      ids: ['li-1'],
      getCurrentItem: (id) => items[id],
      fetchFn,
    })

    expect(result.cleanIds).toEqual([])
    expect(result.failedIds).toEqual(['li-1'])
  })

  it('skips ids whose item is no longer in the store at flush time', async () => {
    const items: Record<string, LineItem> = {
      // li-1 is absent — maybe it was hard-deleted before flush ran
      'li-2': makeLineItem({ id: 'li-2' }),
    }
    const fetchFn = makeFetchOk()

    const result = await flushDirty({
      estimateId: 'e-1',
      ids: ['li-1', 'li-2'],
      getCurrentItem: (id) => items[id],
      fetchFn,
    })

    expect(result.cleanIds).toEqual(['li-2'])
    expect(result.failedIds).toEqual([])
    // Only one fetch fired, for the surviving item.
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('silently skips temp-prefixed ids without firing PATCH', async () => {
    // Optimistically-added rows live in the dirty set under a temp- id until
    // the POST returns. PATCHing them would 404 and pin status to 'error'.
    const items: Record<string, LineItem> = {
      'temp-1779587903958-1': makeLineItem({ id: 'temp-1779587903958-1' }),
      'real-id': makeLineItem({ id: 'real-id' }),
    }
    const fetchFn = makeFetchOk()

    const result = await flushDirty({
      estimateId: 'e-1',
      ids: ['temp-1779587903958-1', 'real-id'],
      getCurrentItem: (id) => items[id],
      fetchFn,
    })

    expect(result.cleanIds).toEqual(['real-id'])
    expect(result.failedIds).toEqual([])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const call = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/estimates/e-1/line-items/real-id')
  })

  it('partial mid-save edits: clean the unchanged item, leave the changed one dirty', async () => {
    const snapshots: Record<string, LineItem> = {
      'li-1': makeLineItem({ id: 'li-1', quantity: 10 }),
      'li-2': makeLineItem({ id: 'li-2', quantity: 20 }),
    }
    let calls = 0
    const fetchFn = vi.fn(async () => {
      calls++
      // After the second fetch fires, mutate li-1's "live" value.
      // The check at flush completion compares live to snapshot — li-2
      // matches snapshot so it cleans; li-1 was mutated mid-flight.
      if (calls === 2) {
        snapshots['li-1'] = makeLineItem({ id: 'li-1', quantity: 999 })
      }
      return { ok: true, status: 200 } as Response
    }) as unknown as typeof fetch

    const result = await flushDirty({
      estimateId: 'e-1',
      ids: ['li-1', 'li-2'],
      getCurrentItem: (id) => snapshots[id],
      fetchFn,
    })

    expect(result.cleanIds).toEqual(['li-2'])
    expect(result.failedIds).toEqual([])
  })
})
