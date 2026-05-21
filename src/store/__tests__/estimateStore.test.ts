import { describe, it, expect, beforeEach } from 'vitest'
import {
  useEstimateStore,
  selectGrandTotal,
  selectFlaggedCount,
  selectFlaggedItems,
  selectIsDirty,
} from '@/store/estimateStore'
import type {
  Estimate,
  EstimateBundle,
  EstimateConfig,
  Job,
  LineItem,
  Trade,
} from '@/lib/estimates/types'

// ─── Fixture builder ─────────────────────────────────────────────────────────

interface BundleOverrides {
  estimate?: Partial<Estimate>
  config?: Partial<EstimateConfig>
  job?: Partial<Job>
  trades?: Trade[]
  line_items?: LineItem[]
}

function makeLineItem(overrides: Partial<LineItem> = {}): LineItem {
  const quantity = overrides.quantity ?? 100
  const material_unit_cost = overrides.material_unit_cost ?? 1
  const labor_unit_cost = overrides.labor_unit_cost ?? 2
  return {
    id: 'li-1',
    trade_id: 't-1',
    description: 'Test item',
    area_location: null,
    quantity,
    unit: 'sf',
    material_unit_cost,
    labor_unit_cost,
    labor_hours_per_unit: null,
    total: quantity * (material_unit_cost + labor_unit_cost),
    source_sheet: null,
    source_grid: null,
    dimension_type: null,
    confidence: 'high',
    flags: [],
    is_allowance: false,
    is_deleted: false,
    is_manual_override: false,
    sort_order: 0,
    ...overrides,
  }
}

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 't-1',
    estimate_id: 'e-1',
    trade_name: 'Trade 1',
    trade_status: 'SP',
    sort_order: 0,
    labor_rate_override: null,
    ai_blended_labor_rate: null,
    // Will be re-derived in hydrate() — leave empty defaults.
    line_item_ids: [],
    subtotal: 0,
    flag_count: 0,
    worst_confidence: null,
    ...overrides,
  }
}

function makeBundle(overrides: BundleOverrides = {}): EstimateBundle {
  const config: EstimateConfig = {
    overhead_pct: 15,
    profit_pct: 10,
    contingency_pct: 5,
    gc_sub_markup_pct: 0,
    ...overrides.config,
  }
  const trades: Trade[] = overrides.trades ?? [
    makeTrade({ id: 't-1', sort_order: 0 }),
    makeTrade({ id: 't-2', trade_name: 'Trade 2', sort_order: 1 }),
  ]
  const line_items: LineItem[] = overrides.line_items ?? [
    makeLineItem({ id: 'li-1', trade_id: 't-1', sort_order: 0 }),
    makeLineItem({
      id: 'li-2',
      trade_id: 't-1',
      sort_order: 1,
      flags: ['low_confidence'],
    }),
    makeLineItem({ id: 'li-3', trade_id: 't-2', sort_order: 0 }),
    makeLineItem({ id: 'li-4', trade_id: 't-2', sort_order: 1 }),
  ]
  // hydrate() does NOT recompute totals — it trusts the bundle. So compute
  // them here from the (non-deleted) line items + config to match what a real
  // RSC fetch would return.
  const direct_cost = line_items
    .filter((li) => !li.is_deleted)
    .reduce((sum, li) => sum + li.total, 0)
  const grand_total =
    direct_cost *
    (1 + config.contingency_pct / 100) *
    (1 + config.overhead_pct / 100) *
    (1 + config.profit_pct / 100)
  const estimate: Estimate = {
    id: 'e-1',
    job_id: 'j-1',
    version: 1,
    review_status: 'in_review',
    config,
    direct_cost,
    grand_total,
    trade_ids: trades.map((t) => t.id),
    flag_count: line_items.filter((li) => li.flags.length > 0 && !li.is_deleted)
      .length,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    approved_by: null,
    approved_at: null,
    ...overrides.estimate,
  }
  const job: Job = {
    id: 'j-1',
    name: 'Test Job',
    client_name: 'Client',
    address: null,
    bid_due_date: null,
    project_type: null,
    ...overrides.job,
  }
  return { estimate, job, trades, line_items }
}

// ─── State reset ─────────────────────────────────────────────────────────────

beforeEach(() => {
  useEstimateStore.setState({
    estimate: null,
    job: null,
    trades: {},
    lineItems: {},
    dirtyItemIds: new Set(),
    savingItemIds: new Set(),
    lastSavedAt: null,
    saveError: null,
    expandedTradeIds: new Set(),
    flagReviewIndex: 0,
    flagReviewComplete: false,
    bottomSheetItemId: null,
    requestChangesOpen: false,
    approveModalOpen: false,
  })
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('estimateStore.hydrate', () => {
  it('populates state correctly', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    const s = useEstimateStore.getState()

    expect(s.estimate).not.toBeNull()
    expect(s.estimate?.id).toBe('e-1')
    expect(s.job?.id).toBe('j-1')
    expect(Object.keys(s.trades)).toEqual(['t-1', 't-2'])
    expect(Object.keys(s.lineItems).sort()).toEqual([
      'li-1',
      'li-2',
      'li-3',
      'li-4',
    ])
    expect(s.dirtyItemIds.size).toBe(0)
    expect(s.expandedTradeIds.size).toBe(0)
    expect(s.trades['t-1'].line_item_ids).toEqual(['li-1', 'li-2'])
    expect(s.trades['t-2'].line_item_ids).toEqual(['li-3', 'li-4'])
  })

  it('filters deleted items out of trade.line_item_ids but keeps them in lineItems map', () => {
    // Re-read of hydrate confirms: deleted items are skipped when building
    // itemsByTrade (and therefore excluded from trade.line_item_ids), but the
    // lineItems map is populated from the full bundle.line_items array via
    // Object.fromEntries, so deleted items remain in the map (useful for any
    // future undo support).
    const bundle = makeBundle({
      line_items: [
        makeLineItem({ id: 'li-1', trade_id: 't-1', sort_order: 0 }),
        makeLineItem({
          id: 'li-2',
          trade_id: 't-1',
          sort_order: 1,
          is_deleted: true,
        }),
        makeLineItem({ id: 'li-3', trade_id: 't-2', sort_order: 0 }),
        makeLineItem({ id: 'li-4', trade_id: 't-2', sort_order: 1 }),
      ],
    })
    useEstimateStore.getState().hydrate(bundle)
    const s = useEstimateStore.getState()

    expect(s.trades['t-1'].line_item_ids).toEqual(['li-1'])
    expect(s.trades['t-1'].line_item_ids).not.toContain('li-2')
    // But the deleted item IS still in the lineItems map.
    expect(s.lineItems['li-2']).toBeDefined()
    expect(s.lineItems['li-2'].is_deleted).toBe(true)
  })
})

describe('estimateStore.updateLineItem', () => {
  it('recomputes line item total, trade subtotal, estimate direct_cost and grand_total', () => {
    // Use a single trade + single line item so the math is unambiguous.
    const bundle = makeBundle({
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
      line_items: [
        makeLineItem({
          id: 'li-1',
          trade_id: 't-1',
          sort_order: 0,
          quantity: 100,
          material_unit_cost: 1,
          labor_unit_cost: 2,
        }),
      ],
      config: {
        contingency_pct: 5,
        overhead_pct: 15,
        profit_pct: 10,
        gc_sub_markup_pct: 0,
      },
    })
    useEstimateStore.getState().hydrate(bundle)

    // Sanity-check initial computed values.
    const before = useEstimateStore.getState()
    expect(before.lineItems['li-1'].total).toBe(300)
    expect(before.trades['t-1'].subtotal).toBe(300)
    expect(before.estimate?.direct_cost).toBe(300)
    expect(before.estimate?.grand_total).toBeCloseTo(398.475, 3)

    useEstimateStore.getState().updateLineItem('li-1', { quantity: 200 })
    const after = useEstimateStore.getState()

    expect(after.lineItems['li-1'].total).toBe(600)
    expect(after.trades['t-1'].subtotal).toBe(600)
    expect(after.estimate?.direct_cost).toBe(600)
    expect(after.estimate?.grand_total).toBeCloseTo(796.95, 2)
  })

  it('adds item id to dirtyItemIds', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    useEstimateStore.getState().updateLineItem('li-1', { quantity: 50 })

    expect(useEstimateStore.getState().dirtyItemIds.has('li-1')).toBe(true)
  })
})

describe('estimateStore.markSaved / markError', () => {
  it('markSaved removes from dirty + saving, sets lastSavedAt, clears saveError', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    useEstimateStore.getState().updateLineItem('li-1', { quantity: 10 })
    // Simulate enter-saving by manipulating state directly: easier than
    // exercising the (un-tested-here) auto-save effect.
    useEstimateStore.setState((s) => {
      s.savingItemIds = new Set(['li-1'])
      s.saveError = 'previous error'
    })

    useEstimateStore.getState().markSaved('li-1')
    const s = useEstimateStore.getState()

    expect(s.dirtyItemIds.has('li-1')).toBe(false)
    expect(s.savingItemIds.has('li-1')).toBe(false)
    expect(s.lastSavedAt).toBeInstanceOf(Date)
    expect(s.saveError).toBeNull()
  })

  it('markError removes ONLY from savingItemIds, keeps dirtyItemIds, sets saveError', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    useEstimateStore.getState().updateLineItem('li-1', { quantity: 10 })
    useEstimateStore.setState((s) => {
      s.savingItemIds = new Set(['li-1'])
    })

    useEstimateStore.getState().markError('li-1', 'network failure')
    const s = useEstimateStore.getState()

    expect(s.dirtyItemIds.has('li-1')).toBe(true)
    expect(s.savingItemIds.has('li-1')).toBe(false)
    expect(s.saveError).toBe('network failure')
  })
})

describe('estimateStore.toggleTrade', () => {
  it('toggles expandedTradeIds set membership', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)

    useEstimateStore.getState().toggleTrade('t-1')
    expect(useEstimateStore.getState().expandedTradeIds.has('t-1')).toBe(true)

    useEstimateStore.getState().toggleTrade('t-1')
    expect(useEstimateStore.getState().expandedTradeIds.has('t-1')).toBe(false)

    useEstimateStore.getState().toggleTrade('t-2')
    expect(useEstimateStore.getState().expandedTradeIds.has('t-2')).toBe(true)
    expect(useEstimateStore.getState().expandedTradeIds.has('t-1')).toBe(false)
  })
})

describe('estimateStore.advanceFlagReview', () => {
  it('increments index, then sets flagReviewComplete when past last item', () => {
    const bundle = makeBundle({
      line_items: [
        makeLineItem({
          id: 'li-1',
          trade_id: 't-1',
          sort_order: 0,
          flags: ['low_confidence'],
        }),
        makeLineItem({
          id: 'li-2',
          trade_id: 't-1',
          sort_order: 1,
          flags: ['assumption'],
        }),
        makeLineItem({ id: 'li-3', trade_id: 't-2', sort_order: 0 }),
        makeLineItem({ id: 'li-4', trade_id: 't-2', sort_order: 1 }),
      ],
    })
    useEstimateStore.getState().hydrate(bundle)

    // After hydrate with 2 flagged items, initial index 0, not complete.
    let s = useEstimateStore.getState()
    expect(s.flagReviewIndex).toBe(0)
    expect(s.flagReviewComplete).toBe(false)

    useEstimateStore.getState().advanceFlagReview()
    s = useEstimateStore.getState()
    expect(s.flagReviewIndex).toBe(1)
    expect(s.flagReviewComplete).toBe(false)

    useEstimateStore.getState().advanceFlagReview()
    s = useEstimateStore.getState()
    expect(s.flagReviewIndex).toBe(1)
    expect(s.flagReviewComplete).toBe(true)

    // Idempotent: further calls don't change index or complete flag.
    useEstimateStore.getState().advanceFlagReview()
    s = useEstimateStore.getState()
    expect(s.flagReviewIndex).toBe(1)
    expect(s.flagReviewComplete).toBe(true)
  })

  it('uses deterministic sort order (by sort_order ASC)', () => {
    // Insert items in reverse-sort order to make sure flaggedItemsSorted
    // is what drives the walkthrough, not insertion order.
    const bundle = makeBundle({
      line_items: [
        makeLineItem({
          id: 'li-b',
          trade_id: 't-1',
          sort_order: 5,
          flags: ['flag-b'],
        }),
        makeLineItem({
          id: 'li-a',
          trade_id: 't-1',
          sort_order: 1,
          flags: ['flag-a'],
        }),
      ],
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
    })
    useEstimateStore.getState().hydrate(bundle)

    const flagged = selectFlaggedItems(useEstimateStore.getState())
    expect(flagged.map((li) => li.id)).toEqual(['li-a', 'li-b'])

    // index 0 maps to li-a (the lowest sort_order), then advanceFlagReview
    // moves to index 1 (li-b), then complete.
    expect(useEstimateStore.getState().flagReviewIndex).toBe(0)
    useEstimateStore.getState().advanceFlagReview()
    expect(useEstimateStore.getState().flagReviewIndex).toBe(1)
    expect(useEstimateStore.getState().flagReviewComplete).toBe(false)
    useEstimateStore.getState().advanceFlagReview()
    expect(useEstimateStore.getState().flagReviewComplete).toBe(true)
  })
})

describe('estimateStore selectors', () => {
  it('selectGrandTotal returns 0 when estimate is null', () => {
    // beforeEach already cleared state.
    expect(selectGrandTotal(useEstimateStore.getState())).toBe(0)
  })

  it('selectFlaggedCount returns the count of items with flags.length > 0 && !is_deleted', () => {
    const bundle = makeBundle({
      line_items: [
        makeLineItem({ id: 'li-1', trade_id: 't-1', flags: ['a'] }),
        makeLineItem({
          id: 'li-2',
          trade_id: 't-1',
          flags: ['b'],
          is_deleted: true,
        }),
        makeLineItem({ id: 'li-3', trade_id: 't-2', flags: [] }),
        makeLineItem({ id: 'li-4', trade_id: 't-2', flags: ['c', 'd'] }),
      ],
    })
    useEstimateStore.getState().hydrate(bundle)
    // li-1 (flagged) and li-4 (flagged) count. li-2 is deleted, li-3 has no flags.
    expect(selectFlaggedCount(useEstimateStore.getState())).toBe(2)
  })

  it('selectFlaggedItems returns items sorted by sort_order', () => {
    const bundle = makeBundle({
      line_items: [
        makeLineItem({
          id: 'li-z',
          trade_id: 't-1',
          sort_order: 10,
          flags: ['a'],
        }),
        makeLineItem({
          id: 'li-y',
          trade_id: 't-1',
          sort_order: 2,
          flags: ['b'],
        }),
        makeLineItem({
          id: 'li-x',
          trade_id: 't-2',
          sort_order: 5,
          flags: ['c'],
        }),
        makeLineItem({
          id: 'li-no-flags',
          trade_id: 't-2',
          sort_order: 0,
          flags: [],
        }),
      ],
    })
    useEstimateStore.getState().hydrate(bundle)
    const flagged = selectFlaggedItems(useEstimateStore.getState())
    expect(flagged.map((li) => li.id)).toEqual(['li-y', 'li-x', 'li-z'])
  })

  it('selectIsDirty returns true when there are dirty items', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    expect(selectIsDirty(useEstimateStore.getState())).toBe(false)
    useEstimateStore.getState().updateLineItem('li-1', { quantity: 999 })
    expect(selectIsDirty(useEstimateStore.getState())).toBe(true)
  })
})

describe('estimateStore.updateLineItemField', () => {
  it('updates a numeric field, sets is_manual_override, recomputes total + aggregates', () => {
    const bundle = makeBundle({
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
      line_items: [
        makeLineItem({
          id: 'li-1',
          trade_id: 't-1',
          quantity: 100,
          material_unit_cost: 1,
          labor_unit_cost: 2,
        }),
      ],
    })
    useEstimateStore.getState().hydrate(bundle)
    useEstimateStore.getState().updateLineItemField('li-1', 'quantity', 200)

    const s = useEstimateStore.getState()
    expect(s.lineItems['li-1'].quantity).toBe(200)
    expect(s.lineItems['li-1'].total).toBe(600)
    expect(s.lineItems['li-1'].is_manual_override).toBe(true)
    expect(s.trades['t-1'].subtotal).toBe(600)
    expect(s.dirtyItemIds.has('li-1')).toBe(true)
  })

  it('coerces string numeric inputs and ignores NaN', () => {
    const bundle = makeBundle({
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
      line_items: [
        makeLineItem({
          id: 'li-1',
          trade_id: 't-1',
          quantity: 5,
          material_unit_cost: 1,
          labor_unit_cost: 2,
        }),
      ],
    })
    useEstimateStore.getState().hydrate(bundle)

    useEstimateStore.getState().updateLineItemField('li-1', 'quantity', '10')
    expect(useEstimateStore.getState().lineItems['li-1'].quantity).toBe(10)

    // NaN input: no-op, value unchanged.
    useEstimateStore.getState().updateLineItemField('li-1', 'quantity', 'abc')
    expect(useEstimateStore.getState().lineItems['li-1'].quantity).toBe(10)
  })

  it('normalises empty-string area_location to null', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)

    useEstimateStore
      .getState()
      .updateLineItemField('li-1', 'area_location', 'East wall')
    expect(useEstimateStore.getState().lineItems['li-1'].area_location).toBe(
      'East wall'
    )

    useEstimateStore.getState().updateLineItemField('li-1', 'area_location', '')
    expect(useEstimateStore.getState().lineItems['li-1'].area_location).toBeNull()
  })

  it('writes description as-is including empty string', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)

    useEstimateStore.getState().updateLineItemField('li-1', 'description', '')
    expect(useEstimateStore.getState().lineItems['li-1'].description).toBe('')
  })

  it('is a no-op for an unknown id', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    const sBefore = useEstimateStore.getState()
    const dirtyBefore = sBefore.dirtyItemIds.size

    useEstimateStore.getState().updateLineItemField('does-not-exist', 'quantity', 1)
    expect(useEstimateStore.getState().dirtyItemIds.size).toBe(dirtyBefore)
  })
})

describe('estimateStore.markItemsClean', () => {
  it('removes multiple ids from dirty + saving sets, sets lastSavedAt, clears saveError', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    useEstimateStore.getState().updateLineItem('li-1', { quantity: 1 })
    useEstimateStore.getState().updateLineItem('li-2', { quantity: 2 })
    useEstimateStore.setState((s) => {
      s.savingItemIds = new Set(['li-1', 'li-2'])
      s.saveError = 'previous'
    })

    useEstimateStore.getState().markItemsClean(['li-1', 'li-2'])
    const s = useEstimateStore.getState()
    expect(s.dirtyItemIds.has('li-1')).toBe(false)
    expect(s.dirtyItemIds.has('li-2')).toBe(false)
    expect(s.savingItemIds.size).toBe(0)
    expect(s.lastSavedAt).toBeInstanceOf(Date)
    expect(s.saveError).toBeNull()
  })

  it('is a no-op when given an empty array (does not touch lastSavedAt)', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    expect(useEstimateStore.getState().lastSavedAt).toBeNull()

    useEstimateStore.getState().markItemsClean([])
    expect(useEstimateStore.getState().lastSavedAt).toBeNull()
  })

  it('only clears the ids passed in — other dirty items are untouched', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    useEstimateStore.getState().updateLineItem('li-1', { quantity: 1 })
    useEstimateStore.getState().updateLineItem('li-2', { quantity: 2 })

    useEstimateStore.getState().markItemsClean(['li-1'])
    const s = useEstimateStore.getState()
    expect(s.dirtyItemIds.has('li-1')).toBe(false)
    expect(s.dirtyItemIds.has('li-2')).toBe(true)
  })
})

describe('estimateStore.addLineItem', () => {
  it('appends a MANUAL row with default values and recomputes trade aggregates', () => {
    const bundle = makeBundle({
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
      line_items: [
        makeLineItem({
          id: 'li-1',
          trade_id: 't-1',
          sort_order: 0,
          quantity: 10,
          material_unit_cost: 1,
          labor_unit_cost: 1,
        }),
      ],
    })
    useEstimateStore.getState().hydrate(bundle)
    expect(useEstimateStore.getState().trades['t-1'].subtotal).toBe(20)

    useEstimateStore
      .getState()
      .addLineItem('t-1', { id: 'temp-1', description: 'new manual row' })

    const s = useEstimateStore.getState()
    const newItem = s.lineItems['temp-1']
    expect(newItem).toBeDefined()
    expect(newItem.description).toBe('new manual row')
    expect(newItem.source_sheet).toBe('MANUAL')
    expect(newItem.is_manual_override).toBe(true)
    expect(newItem.is_deleted).toBe(false)
    expect(newItem.quantity).toBe(0)
    expect(newItem.total).toBe(0)
    expect(newItem.sort_order).toBe(1)
    expect(s.trades['t-1'].line_item_ids).toEqual(['li-1', 'temp-1'])
    // subtotal unchanged because new row has $0 total
    expect(s.trades['t-1'].subtotal).toBe(20)
    // NOT in dirty set — UI POSTs explicitly
    expect(s.dirtyItemIds.has('temp-1')).toBe(false)
  })

  it('starts sort_order at 0 when the trade is empty', () => {
    const bundle = makeBundle({
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
      line_items: [],
    })
    useEstimateStore.getState().hydrate(bundle)

    useEstimateStore.getState().addLineItem('t-1', { id: 'temp-1' })
    expect(useEstimateStore.getState().lineItems['temp-1'].sort_order).toBe(0)
  })

  it('is a no-op for an unknown trade id', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    const before = useEstimateStore.getState()
    const itemsBefore = Object.keys(before.lineItems).length

    useEstimateStore.getState().addLineItem('not-a-trade', { id: 'temp-1' })
    expect(Object.keys(useEstimateStore.getState().lineItems).length).toBe(
      itemsBefore
    )
  })
})

describe('estimateStore.softDeleteLineItem', () => {
  it('marks is_deleted, excludes from trade subtotal, recomputes estimate totals', () => {
    const bundle = makeBundle({
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
      line_items: [
        makeLineItem({
          id: 'li-1',
          trade_id: 't-1',
          quantity: 100,
          material_unit_cost: 1,
          labor_unit_cost: 1,
        }),
        makeLineItem({
          id: 'li-2',
          trade_id: 't-1',
          sort_order: 1,
          quantity: 50,
          material_unit_cost: 1,
          labor_unit_cost: 1,
        }),
      ],
      config: {
        contingency_pct: 0,
        overhead_pct: 0,
        profit_pct: 0,
        gc_sub_markup_pct: 0,
      },
    })
    useEstimateStore.getState().hydrate(bundle)
    expect(useEstimateStore.getState().trades['t-1'].subtotal).toBe(300)
    expect(useEstimateStore.getState().estimate?.direct_cost).toBe(300)

    useEstimateStore.getState().softDeleteLineItem('li-1')
    const s = useEstimateStore.getState()
    expect(s.lineItems['li-1'].is_deleted).toBe(true)
    // li-2 contributes 50 × ($1 + $1) = 100
    expect(s.trades['t-1'].subtotal).toBe(100)
    expect(s.estimate?.direct_cost).toBe(100)
    expect(s.estimate?.grand_total).toBe(100)
    // li-1 stays in line_item_ids so "Show deleted" can re-reveal it.
    expect(s.trades['t-1'].line_item_ids).toContain('li-1')
  })

  it('also clears the deleted item from the trade flag_count', () => {
    const bundle = makeBundle({
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
      line_items: [
        makeLineItem({ id: 'li-1', trade_id: 't-1', flags: ['low_conf'] }),
        makeLineItem({
          id: 'li-2',
          trade_id: 't-1',
          sort_order: 1,
          flags: ['rfi'],
        }),
      ],
    })
    useEstimateStore.getState().hydrate(bundle)
    expect(useEstimateStore.getState().trades['t-1'].flag_count).toBe(2)

    useEstimateStore.getState().softDeleteLineItem('li-1')
    expect(useEstimateStore.getState().trades['t-1'].flag_count).toBe(1)
  })

  it('is idempotent — calling twice does not double-affect totals', () => {
    const bundle = makeBundle({
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
      line_items: [
        makeLineItem({
          id: 'li-1',
          trade_id: 't-1',
          quantity: 10,
          material_unit_cost: 1,
          labor_unit_cost: 1,
        }),
      ],
      config: {
        contingency_pct: 0,
        overhead_pct: 0,
        profit_pct: 0,
        gc_sub_markup_pct: 0,
      },
    })
    useEstimateStore.getState().hydrate(bundle)

    useEstimateStore.getState().softDeleteLineItem('li-1')
    const afterFirst = useEstimateStore.getState().trades['t-1'].subtotal
    useEstimateStore.getState().softDeleteLineItem('li-1')
    expect(useEstimateStore.getState().trades['t-1'].subtotal).toBe(afterFirst)
  })

  it('is a no-op for an unknown id', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    const before = useEstimateStore.getState().trades['t-1'].subtotal

    useEstimateStore.getState().softDeleteLineItem('does-not-exist')
    expect(useEstimateStore.getState().trades['t-1'].subtotal).toBe(before)
  })
})

describe('estimateStore.replaceLineItemId', () => {
  it('swaps the key in lineItems, the entry in trade.line_item_ids, and migrates dirty/saving membership', () => {
    const bundle = makeBundle({
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
      line_items: [],
    })
    useEstimateStore.getState().hydrate(bundle)

    useEstimateStore
      .getState()
      .addLineItem('t-1', { id: 'temp-abc', description: 'pending' })
    // Pretend an edit happened on the temp row so it's also in dirty set.
    useEstimateStore.setState((s) => {
      s.dirtyItemIds = new Set(['temp-abc'])
      s.savingItemIds = new Set(['temp-abc'])
    })

    useEstimateStore.getState().replaceLineItemId('temp-abc', 'real-xyz')
    const s = useEstimateStore.getState()

    expect(s.lineItems['real-xyz']).toBeDefined()
    expect(s.lineItems['real-xyz'].id).toBe('real-xyz')
    expect(s.lineItems['temp-abc']).toBeUndefined()
    expect(s.trades['t-1'].line_item_ids).toEqual(['real-xyz'])
    expect(s.dirtyItemIds.has('real-xyz')).toBe(true)
    expect(s.dirtyItemIds.has('temp-abc')).toBe(false)
    expect(s.savingItemIds.has('real-xyz')).toBe(true)
    expect(s.savingItemIds.has('temp-abc')).toBe(false)
  })

  it('is a no-op when tempId === realId', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    const before = useEstimateStore.getState().lineItems['li-1']

    useEstimateStore.getState().replaceLineItemId('li-1', 'li-1')
    expect(useEstimateStore.getState().lineItems['li-1']).toEqual(before)
  })

  it('is a no-op for an unknown tempId', () => {
    const bundle = makeBundle()
    useEstimateStore.getState().hydrate(bundle)
    const before = Object.keys(useEstimateStore.getState().lineItems).length

    useEstimateStore.getState().replaceLineItemId('not-here', 'real-id')
    expect(Object.keys(useEstimateStore.getState().lineItems).length).toBe(before)
    expect(useEstimateStore.getState().lineItems['real-id']).toBeUndefined()
  })
})

describe('estimateStore.updateLineItem — deleted item subtotal regression', () => {
  it('excludes soft-deleted items from the recomputed trade subtotal after a sibling edit', () => {
    const bundle = makeBundle({
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
      line_items: [
        makeLineItem({
          id: 'li-1',
          trade_id: 't-1',
          quantity: 10,
          material_unit_cost: 1,
          labor_unit_cost: 1,
        }),
        makeLineItem({
          id: 'li-2',
          trade_id: 't-1',
          sort_order: 1,
          quantity: 5,
          material_unit_cost: 1,
          labor_unit_cost: 1,
        }),
      ],
      config: {
        contingency_pct: 0,
        overhead_pct: 0,
        profit_pct: 0,
        gc_sub_markup_pct: 0,
      },
    })
    useEstimateStore.getState().hydrate(bundle)

    useEstimateStore.getState().softDeleteLineItem('li-2')
    expect(useEstimateStore.getState().trades['t-1'].subtotal).toBe(20)

    // Editing the surviving item must not bring the deleted one back into
    // the subtotal — this was the bug the new recomputeTradeAggregates
    // helper fixes.
    useEstimateStore.getState().updateLineItem('li-1', { quantity: 20 })
    expect(useEstimateStore.getState().trades['t-1'].subtotal).toBe(40)
  })
})

describe('estimateStore.updateEstimateConfig', () => {
  it('recomputes grand_total with new config', () => {
    const bundle = makeBundle({
      trades: [makeTrade({ id: 't-1', sort_order: 0 })],
      line_items: [
        makeLineItem({
          id: 'li-1',
          trade_id: 't-1',
          sort_order: 0,
          quantity: 100,
          material_unit_cost: 1,
          labor_unit_cost: 2,
        }),
      ],
      config: {
        contingency_pct: 5,
        overhead_pct: 15,
        profit_pct: 10,
        gc_sub_markup_pct: 0,
      },
    })
    useEstimateStore.getState().hydrate(bundle)

    // Initial: 300 * 1.05 * 1.15 * 1.10 = 398.475
    expect(useEstimateStore.getState().estimate?.grand_total).toBeCloseTo(
      398.475,
      3
    )

    useEstimateStore.getState().updateEstimateConfig({ overhead_pct: 20 })
    // New: 300 * 1.05 * 1.20 * 1.10 = 415.8
    expect(useEstimateStore.getState().estimate?.grand_total).toBeCloseTo(
      415.8,
      3
    )
    expect(useEstimateStore.getState().estimate?.config.overhead_pct).toBe(20)
  })
})
