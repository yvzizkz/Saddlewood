import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSupabase, payloadOf } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Imported AFTER vi.mock so it picks up the mocked createClient.
import { PATCH } from '../route'
import { createClient } from '@/lib/supabase/server'

const USER = { id: 'user-marco', email: 'marco@example.com' }
const ESTIMATE_ID = '11111111-1111-4111-8111-111111111111'
const LINE_ITEM_ID = '22222222-2222-4222-8222-222222222222'

function makeRequest(body: unknown | string): Request {
  return new Request(`http://localhost/api/estimates/${ESTIMATE_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: ESTIMATE_ID })

beforeEach(() => {
  // Reset env between tests so ESTIMATOR_EMAIL state is explicit per case.
  delete process.env.ESTIMATOR_EMAIL
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/estimates/[id] — auth + body validation', () => {
  it('returns 401 when no user is on the session', async () => {
    const mock = makeSupabase({ user: null })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(makeRequest({ action: 'approve', notifyEstimator: false }) as never, { params })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    // We must not touch the DB at all when auth fails.
    expect(mock.client.from).not.toHaveBeenCalled()
  })

  it('returns 400 on malformed JSON', async () => {
    const mock = makeSupabase({ user: USER })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(makeRequest('{not json') as never, { params })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mock.client.from).not.toHaveBeenCalled()
  })

  it('returns 400 when action is missing', async () => {
    const mock = makeSupabase({ user: USER })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(makeRequest({ notifyEstimator: true }) as never, { params })

    expect(res.status).toBe(400)
    const payload = await res.json()
    expect(payload).toHaveProperty('error')
  })

  it('returns 400 when overallNote is empty for request_changes', async () => {
    const mock = makeSupabase({ user: USER })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(
      makeRequest({ action: 'request_changes', overallNote: '' }) as never,
      { params }
    )

    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/estimates/[id] — approve flow', () => {
  it('marks the estimate approved and records approver + timestamp', async () => {
    const mock = makeSupabase({
      user: USER,
      fromResults: [{ error: null }], // estimates.update.eq(...)
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(
      makeRequest({ action: 'approve', notifyEstimator: false }) as never,
      { params }
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'approved' })

    // Only the estimates update should have run (no email_log when notifyEstimator=false).
    expect(mock.fromCalls).toHaveLength(1)
    const updateCall = mock.fromCalls[0]
    expect(updateCall.table).toBe('estimates')
    const patch = payloadOf(updateCall, 'update') as Record<string, unknown>
    expect(patch.review_status).toBe('approved')
    expect(patch.approved_by).toBe(USER.id)
    expect(typeof patch.approved_at).toBe('string')
    // ISO-ish — the route uses new Date().toISOString()
    expect(patch.approved_at as string).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('queues an email_log row when notifyEstimator=true AND ESTIMATOR_EMAIL is set', async () => {
    process.env.ESTIMATOR_EMAIL = 'estimator@saddlewood.example'
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { error: null }, // estimates.update.eq
        { error: null }, // email_log.insert
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(
      makeRequest({ action: 'approve', notifyEstimator: true }) as never,
      { params }
    )

    expect(res.status).toBe(200)
    expect(mock.fromCalls).toHaveLength(2)
    const emailCall = mock.fromCalls[1]
    expect(emailCall.table).toBe('email_log')
    const emailPayload = payloadOf(emailCall, 'insert') as Record<string, unknown>
    expect(emailPayload.estimate_id).toBe(ESTIMATE_ID)
    expect(emailPayload.recipient).toBe('estimator@saddlewood.example')
    expect(emailPayload.template).toBe('estimate_approved')
    expect(emailPayload.status).toBe('queued')
  })

  it('does NOT queue an email when ESTIMATOR_EMAIL is unset (even if notifyEstimator=true)', async () => {
    // ESTIMATOR_EMAIL not set in beforeEach.
    const mock = makeSupabase({
      user: USER,
      fromResults: [{ error: null }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(
      makeRequest({ action: 'approve', notifyEstimator: true }) as never,
      { params }
    )

    expect(res.status).toBe(200)
    expect(mock.fromCalls).toHaveLength(1)
    expect(mock.fromCalls[0].table).toBe('estimates')
  })

  it('returns 500 when the estimate update fails', async () => {
    const mock = makeSupabase({
      user: USER,
      fromResults: [{ error: { message: 'permission denied' } }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(
      makeRequest({ action: 'approve', notifyEstimator: false }) as never,
      { params }
    )

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'permission denied' })
  })

  it('swallows email_log insert failures so they do not break approve', async () => {
    process.env.ESTIMATOR_EMAIL = 'estimator@saddlewood.example'
    const mock = makeSupabase({
      user: USER,
      fromResults: [
        { error: null },
        { error: { message: 'email_log table missing' } },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await PATCH(
      makeRequest({ action: 'approve', notifyEstimator: true }) as never,
      { params }
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'approved' })
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})

describe('PATCH /api/estimates/[id] — request_changes flow', () => {
  it('marks the estimate changes_requested and echoes note + flagNotes', async () => {
    const mock = makeSupabase({
      user: USER,
      fromResults: [{ error: null }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const flagNotes = [{ lineItemId: LINE_ITEM_ID, note: 'check qty' }]
    const res = await PATCH(
      makeRequest({
        action: 'request_changes',
        overallNote: 'verify quantities on framing',
        flagNotes,
      }) as never,
      { params }
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'changes_requested',
      note: 'verify quantities on framing',
      flagNotes,
    })

    const updateCall = mock.fromCalls[0]
    expect(updateCall.table).toBe('estimates')
    const patch = payloadOf(updateCall, 'update') as Record<string, unknown>
    expect(patch.review_status).toBe('changes_requested')
  })

  it('queues an email_log row for request_changes when ESTIMATOR_EMAIL is set', async () => {
    process.env.ESTIMATOR_EMAIL = 'estimator@saddlewood.example'
    const mock = makeSupabase({
      user: USER,
      fromResults: [{ error: null }, { error: null }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(
      makeRequest({
        action: 'request_changes',
        overallNote: 'please re-check trade 3',
      }) as never,
      { params }
    )

    expect(res.status).toBe(200)
    expect(mock.fromCalls).toHaveLength(2)
    const emailCall = mock.fromCalls[1]
    expect(emailCall.table).toBe('email_log')
    const emailPayload = payloadOf(emailCall, 'insert') as Record<string, unknown>
    expect(emailPayload.template).toBe('estimate_changes_requested')
    expect(emailPayload.status).toBe('queued')
  })

  it('returns 500 when the changes_requested update fails', async () => {
    const mock = makeSupabase({
      user: USER,
      fromResults: [{ error: { message: 'db down' } }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.client as never)

    const res = await PATCH(
      makeRequest({
        action: 'request_changes',
        overallNote: 'needs work',
      }) as never,
      { params }
    )

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'db down' })
  })
})
