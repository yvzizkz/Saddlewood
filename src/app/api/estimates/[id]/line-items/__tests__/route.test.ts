import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeSupabase, payloadOf } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { POST } from '../route'
import { createClient } from '@/lib/supabase/server'

const USER = { id: 'user-marco', email: 'marco@example.com' }
const ESTIMATE_ID = '11111111-1111-4111-8111-111111111111'
const TRADE_ID = '33333333-3333-4333-8333-333333333333'
const NEW_ITEM_ID = '44444444-4444-4444-8444-444444444444'

const params = Promise.resolve({ id: ESTIMATE_ID })

function makeRequest(body: unknown | string): Request {
  return new Request(`http://localhost/api/estimates/${ESTIMATE_ID}/line-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/estimates/[id]/line-items — auth + validation', () => {
  it('returns 401 when no user', async () => {
    const mock = makeSupabase({ user: null })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await POST(
      makeRequest({ trade_id: TRADE_ID }) as never,
      { params }
    )

    expect(res.status).toBe(401)
    expect(mock.client.from).not.toHaveBeenCalled()
  })

  it('returns 400 on malformed JSON', async () => {
    const mock = makeSupabase({ user: USER })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await POST(makeRequest('{not json') as never, { params })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' })
  })

  it('returns 400 on missing trade_id', async () => {
    const mock = makeSupabase({ user: USER })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await POST(makeRequest({}) as never, { params })

    expect(res.status).toBe(400)
    expect(mock.client.from).not.toHaveBeenCalled()
  })

  it('returns 400 on non-UUID trade_id', async () => {
    const mock = makeSupabase({ user: USER })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await POST(
      makeRequest({ trade_id: 'not-a-uuid' }) as never,
      { params }
    )

    expect(res.status).toBe(400)
  })
})

describe('POST /api/estimates/[id]/line-items — cross-estimate guard', () => {
  it('returns 404 when the trade does not exist', async () => {
    const mock = makeSupabase({
      user: USER,
      fromResults: [{ data: null, error: { message: 'no rows' } }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await POST(
      makeRequest({ trade_id: TRADE_ID }) as never,
      { params }
    )

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Trade not found' })
  })

  it('returns 400 when the trade belongs to a different estimate', async () => {
    const otherEstimate = '99999999-9999-4999-8999-999999999999'
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: { estimate_id: otherEstimate }, error: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await POST(
      makeRequest({ trade_id: TRADE_ID }) as never,
      { params }
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Estimate mismatch' })
  })
})

describe('POST /api/estimates/[id]/line-items — happy path', () => {
  it('inserts a MANUAL row with empty defaults and returns 201 with the row', async () => {
    const newRow = {
      id: NEW_ITEM_ID,
      trade_id: TRADE_ID,
      description: '',
      area_location: null,
      quantity: 0,
      unit: null,
      material_unit_cost: 0,
      labor_unit_cost: 0,
      labor_hours_per_unit: null,
      total: 0,
      source_sheet: 'MANUAL',
      source_grid: null,
      dimension_type: null,
      confidence: null,
      flags: [],
      is_allowance: false,
      is_deleted: false,
      is_manual_override: true,
      sort_order: 1,
    }
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        // 1. trade lookup
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        // 2. max sort_order lookup
        { data: { sort_order: 0 }, error: null },
        // 3. insert returning new row
        { data: newRow, error: null },
        // 4. audit insert
        { error: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await POST(
      makeRequest({ trade_id: TRADE_ID }) as never,
      { params }
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ item: newRow })

    const insertCall = mock.fromCalls[2]
    expect(insertCall.table).toBe('estimate_line_items')
    const payload = payloadOf(insertCall, 'insert') as Record<string, unknown>
    expect(payload.trade_id).toBe(TRADE_ID)
    expect(payload.description).toBe('')
    expect(payload.area_location).toBeNull()
    expect(payload.source_sheet).toBe('MANUAL')
    expect(payload.is_manual_override).toBe(true)
    expect(payload.is_deleted).toBe(false)
    expect(payload.sort_order).toBe(1)
  })

  it('starts sort_order at 0 when the trade has no existing items', async () => {
    const newRow = {
      id: NEW_ITEM_ID,
      trade_id: TRADE_ID,
      description: 'first row',
      area_location: null,
      sort_order: 0,
    }
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        // maybeSingle returns null when no rows match
        { data: null, error: null },
        { data: newRow, error: null },
        { error: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await POST(
      makeRequest({ trade_id: TRADE_ID, description: 'first row' }) as never,
      { params }
    )

    expect(res.status).toBe(201)
    const insertCall = mock.fromCalls[2]
    const payload = payloadOf(insertCall, 'insert') as Record<string, unknown>
    expect(payload.sort_order).toBe(0)
    expect(payload.description).toBe('first row')
  })

  it('writes an audit row tagged "added" with new_value=MANUAL', async () => {
    const newRow = { id: NEW_ITEM_ID, trade_id: TRADE_ID, sort_order: 0 }
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        { data: null, error: null },
        { data: newRow, error: null },
        { error: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    await POST(makeRequest({ trade_id: TRADE_ID }) as never, { params })

    const auditCall = mock.fromCalls[3]
    expect(auditCall.table).toBe('estimate_overrides')
    const payload = payloadOf(auditCall, 'insert') as Record<string, unknown>
    expect(payload.field_name).toBe('added')
    expect(payload.old_value).toBeNull()
    expect(payload.new_value).toBe('MANUAL')
    expect(payload.line_item_id).toBe(NEW_ITEM_ID)
    expect(payload.changed_by).toBe(USER.email)
  })

  it('returns 500 when insert fails', async () => {
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        { data: null, error: null },
        { data: null, error: { message: 'insert blocked' } },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await POST(
      makeRequest({ trade_id: TRADE_ID }) as never,
      { params }
    )

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'insert blocked' })
  })

  it('swallows audit insert failures without breaking the response', async () => {
    const newRow = { id: NEW_ITEM_ID, trade_id: TRADE_ID, sort_order: 0 }
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { data: { estimate_id: ESTIMATE_ID }, error: null },
        { data: null, error: null },
        { data: newRow, error: null },
        { error: { message: 'audit table missing' } },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(
      makeRequest({ trade_id: TRADE_ID }) as never,
      { params }
    )

    expect(res.status).toBe(201)
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
