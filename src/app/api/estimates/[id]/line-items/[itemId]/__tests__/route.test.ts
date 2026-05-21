import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeSupabase, payloadOf } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { PATCH } from '../route'
import { createClient } from '@/lib/supabase/server'

const USER = { id: 'user-marco', email: 'marco@example.com' }
const ESTIMATE_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'
const TRADE_ID = '33333333-3333-4333-8333-333333333333'

const params = Promise.resolve({ id: ESTIMATE_ID, itemId: ITEM_ID })

function makeRequest(body: unknown | string): Request {
  return new Request(
    `http://localhost/api/estimates/${ESTIMATE_ID}/line-items/${ITEM_ID}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/estimates/[id]/line-items/[itemId] — auth + validation', () => {
  it('returns 401 when no user is on the session', async () => {
    const mock = makeSupabase({ user: null })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(makeRequest({ quantity: 10 }) as never, { params })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(mock.client.from).not.toHaveBeenCalled()
  })

  it('returns 400 on malformed JSON', async () => {
    const mock = makeSupabase({ user: USER })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(makeRequest('{not json') as never, { params })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' })
  })

  it('returns 400 when no editable fields are provided', async () => {
    const mock = makeSupabase({ user: USER })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(makeRequest({}) as never, { params })

    expect(res.status).toBe(400)
    expect(mock.client.from).not.toHaveBeenCalled()
  })

  it('returns 400 when a numeric field is negative', async () => {
    const mock = makeSupabase({ user: USER })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(
      makeRequest({ quantity: -1 }) as never,
      { params }
    )

    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/estimates/[id]/line-items/[itemId] — cross-tenant guard', () => {
  it('returns 404 when the line item does not exist', async () => {
    const mock = makeSupabase({
      user: USER,
      fromResults: [{ data: null, error: { message: 'no rows' } }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(makeRequest({ quantity: 10 }) as never, { params })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Line item not found' })
  })

  it('returns 400 when the line item belongs to a different estimate', async () => {
    const otherEstimate = '99999999-9999-4999-8999-999999999999'
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        // estimate_line_items.select.eq.single — found
        {
          data: {
            id: ITEM_ID,
            quantity: '10',
            material_unit_cost: '1.00',
            labor_unit_cost: '2.00',
            trade_id: TRADE_ID,
          },
          error: null,
        },
        // estimate_trades.select.eq.single — but its estimate_id is different
        { data: { estimate_id: otherEstimate }, error: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(makeRequest({ quantity: 11 }) as never, { params })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Estimate mismatch' })
    // Should not have run the update query.
    expect(mock.fromCalls).toHaveLength(2)
  })

  it('returns 400 when the trade row cannot be resolved', async () => {
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        {
          data: {
            id: ITEM_ID,
            quantity: '10',
            material_unit_cost: '1.00',
            labor_unit_cost: '2.00',
            trade_id: TRADE_ID,
          },
          error: null,
        },
        { data: null, error: { message: 'trade missing' } },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(makeRequest({ quantity: 11 }) as never, { params })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Estimate mismatch' })
  })
})

describe('PATCH /api/estimates/[id]/line-items/[itemId] — happy path + side effects', () => {
  it('updates the line item and forces is_manual_override=true on the patch', async () => {
    const before = {
      id: ITEM_ID,
      quantity: '10',
      material_unit_cost: '1.00',
      labor_unit_cost: '2.00',
      trade_id: TRADE_ID,
    }
    const after = {
      id: ITEM_ID,
      quantity: 12,
      material_unit_cost: 1.0,
      labor_unit_cost: 2.0,
      total: 36,
      is_manual_override: true,
    }
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: before, error: null }, // select before
        { data: { estimate_id: ESTIMATE_ID }, error: null }, // trade lookup
        { data: after, error: null }, // update returning after
        { error: null }, // audit insert
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(
      makeRequest({ quantity: 12 }) as never,
      { params }
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ item: after })

    // Update call: third .from() call.
    const updateCall = mock.fromCalls[2]
    expect(updateCall.table).toBe('estimate_line_items')
    const patch = payloadOf(updateCall, 'update') as Record<string, unknown>
    expect(patch).toEqual({ quantity: 12, is_manual_override: true })
  })

  it('appends an audit row only for the field that actually changed', async () => {
    const before = {
      id: ITEM_ID,
      // Supabase returns numeric columns as strings in @supabase/supabase-js.
      // The route must coerce via Number() before comparing for change.
      quantity: '10',
      material_unit_cost: '1.00',
      labor_unit_cost: '2.00',
      trade_id: TRADE_ID,
    }
    const after = {
      id: ITEM_ID,
      quantity: 12,
      material_unit_cost: 1.0,
      labor_unit_cost: 2.0,
      total: 36,
      is_manual_override: true,
    }
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: before, error: null },
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        { data: after, error: null },
        { error: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    // Send patch where quantity changes (10 -> 12) and material_unit_cost
    // is "changed" to the SAME value (1.00 -> 1). Only quantity should be
    // recorded in the audit log.
    const res = await PATCH(
      makeRequest({ quantity: 12, material_unit_cost: 1 }) as never,
      { params }
    )

    expect(res.status).toBe(200)
    const auditCall = mock.fromCalls[3]
    expect(auditCall.table).toBe('estimate_overrides')
    const rows = payloadOf(auditCall, 'insert') as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0].field_name).toBe('quantity')
    expect(rows[0].old_value).toBe('10')
    expect(rows[0].new_value).toBe('12')
    expect(rows[0].estimate_id).toBe(ESTIMATE_ID)
    expect(rows[0].trade_id).toBe(TRADE_ID)
    expect(rows[0].line_item_id).toBe(ITEM_ID)
    expect(rows[0].changed_by).toBe(USER.email)
  })

  it('skips the audit insert entirely when no field actually changed', async () => {
    const before = {
      id: ITEM_ID,
      quantity: '10',
      material_unit_cost: '1.00',
      labor_unit_cost: '2.00',
      trade_id: TRADE_ID,
    }
    const after = { ...before, total: 30, is_manual_override: true }
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: before, error: null },
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        { data: after, error: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    // Submit the SAME values that already exist. No audit row should be inserted.
    const res = await PATCH(
      makeRequest({ quantity: 10, material_unit_cost: 1, labor_unit_cost: 2 }) as never,
      { params }
    )

    expect(res.status).toBe(200)
    // Exactly 3 .from() calls: select before, trade lookup, update. No insert.
    expect(mock.fromCalls).toHaveLength(3)
  })

  it('returns 500 when the update query fails', async () => {
    const before = {
      id: ITEM_ID,
      quantity: '10',
      material_unit_cost: '1.00',
      labor_unit_cost: '2.00',
      trade_id: TRADE_ID,
    }
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: before, error: null },
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        { data: null, error: { message: 'check constraint violated' } },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(makeRequest({ quantity: 12 }) as never, { params })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'check constraint violated' })
  })

  it('swallows audit-log insert failures so they do not break the update', async () => {
    const before = {
      id: ITEM_ID,
      quantity: '10',
      material_unit_cost: '1.00',
      labor_unit_cost: '2.00',
      trade_id: TRADE_ID,
    }
    const after = {
      id: ITEM_ID,
      quantity: 12,
      material_unit_cost: 1.0,
      labor_unit_cost: 2.0,
      total: 36,
      is_manual_override: true,
    }
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: before, error: null },
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        { data: after, error: null },
        { error: { message: 'estimate_overrides table missing' } },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await PATCH(makeRequest({ quantity: 12 }) as never, { params })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ item: after })
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('does not record a spurious audit row when input differs only beyond numeric(14,4) precision', async () => {
    // DB stores numeric(14,4) so anything past the 4th decimal is rounded
    // off on store. The route must round input the same way before comparing
    // to `before` so 5.00001 -> "5.0000" isn't flagged as a change.
    const before = {
      id: ITEM_ID,
      quantity: '5.0000',
      material_unit_cost: '1.00',
      labor_unit_cost: '2.00',
      trade_id: TRADE_ID,
    }
    const after = {
      id: ITEM_ID,
      quantity: 5,
      material_unit_cost: 1.0,
      labor_unit_cost: 2.0,
      total: 15,
      is_manual_override: true,
    }
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: before, error: null },
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        { data: after, error: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(
      makeRequest({ quantity: 5.00001 }) as never,
      { params }
    )

    expect(res.status).toBe(200)
    // No audit insert — only 3 .from() calls.
    expect(mock.fromCalls).toHaveLength(3)
  })

  it('rounds new_value to 4 decimals in the audit row', async () => {
    const before = {
      id: ITEM_ID,
      quantity: '5.0000',
      material_unit_cost: '1.00',
      labor_unit_cost: '2.00',
      trade_id: TRADE_ID,
    }
    const after = {
      id: ITEM_ID,
      quantity: 7.12345,
      material_unit_cost: 1.0,
      labor_unit_cost: 2.0,
      total: 21.3703,
      is_manual_override: true,
    }
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: before, error: null },
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        { data: after, error: null },
        { error: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(
      makeRequest({ quantity: 7.12345 }) as never,
      { params }
    )

    expect(res.status).toBe(200)
    const auditCall = mock.fromCalls[3]
    const rows = payloadOf(auditCall, 'insert') as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    // 7.12345 rounded to 4 decimals = 7.1235
    expect(rows[0].new_value).toBe('7.1235')
    expect(rows[0].old_value).toBe('5.0000')
  })

  it('uses user.id as changed_by when user.email is absent', async () => {
    const before = {
      id: ITEM_ID,
      quantity: '10',
      material_unit_cost: '1.00',
      labor_unit_cost: '2.00',
      trade_id: TRADE_ID,
    }
    const after = {
      id: ITEM_ID,
      quantity: 11,
      material_unit_cost: 1.0,
      labor_unit_cost: 2.0,
      total: 33,
      is_manual_override: true,
    }
    const mock = makeSupabase({
      user: { id: 'svc-bot' }, // no email
      fromResults: [
        { data: before, error: null },
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        { data: after, error: null },
        { error: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(makeRequest({ quantity: 11 }) as never, { params })

    expect(res.status).toBe(200)
    const auditCall = mock.fromCalls[3]
    const rows = payloadOf(auditCall, 'insert') as Array<Record<string, unknown>>
    expect(rows[0].changed_by).toBe('svc-bot')
  })
})
