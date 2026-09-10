import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeState } from '@/lib/trackers/core'
import state09 from '@/lib/trackers/__tests__/fixtures/powell-3526-09.state.json'

const { getMock, listMock, saveMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  listMock: vi.fn(),
  saveMock: vi.fn(),
}))
vi.mock('@/lib/trackers/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/trackers/queries')>('@/lib/trackers/queries')
  return { ...actual, getTracker: getMock, listInvoices: listMock, saveTracker: saveMock }
})
// No session in tests: the server client reports no user.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}))

import { GET, PUT } from '../route'

const TOKEN = 'test-token-with-enough-length-1234'
const state = normalizeState(state09)
const record = { id: 'powell', projectName: 'Powell Residence', invoiceNumber: '3526-09', state, updatedBy: 'x', updatedAt: '2026-09-10T00:00:00Z', createdAt: '2026-09-10T00:00:00Z' }

function req(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/trackers/powell', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: 'powell' }) }
const auth = { Authorization: `Bearer ${TOKEN}` }

beforeEach(() => {
  getMock.mockReset()
  listMock.mockReset()
  saveMock.mockReset()
  getMock.mockResolvedValue(record)
  listMock.mockResolvedValue([])
  saveMock.mockImplementation(async (_id: string, st: typeof state, actor: string) => ({ ...record, state: st, updatedBy: actor, updatedAt: '2026-09-10T00:00:01Z' }))
  vi.stubEnv('OPS_AGENT_TOKEN', TOKEN)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('tracker API auth', () => {
  it('refuses anonymous reads and writes', async () => {
    expect((await GET(req('GET') as never, ctx)).status).toBe(401)
    expect((await PUT(req('PUT', { state }) as never, ctx)).status).toBe(401)
    expect(getMock).not.toHaveBeenCalled()
    expect(saveMock).not.toHaveBeenCalled()
  })
  it('reads with the agent token', async () => {
    const res = await GET(req('GET', undefined, auth) as never, ctx)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.tracker.id).toBe('powell')
    expect(json.tracker.state.lines).toHaveLength(26)
  })
})

describe('tracker API save', () => {
  it('validates the body', async () => {
    const res = await PUT(req('PUT', { state: { ...state, lines: [] } }, auth) as never, ctx)
    expect(res.status).toBe(400)
    expect(saveMock).not.toHaveBeenCalled()
  })
  it('saves a valid state with the actor and base updated_at', async () => {
    const res = await PUT(req('PUT', { state, baseUpdatedAt: record.updatedAt }, auth) as never, ctx)
    expect(res.status).toBe(200)
    expect(saveMock).toHaveBeenCalledWith('powell', expect.objectContaining({ invoice: expect.objectContaining({ number: '3526-09' }) }), 'agent', record.updatedAt)
  })
  it('rejects unknown ids', async () => {
    const res = await GET(req('GET', undefined, auth) as never, { params: Promise.resolve({ id: 'Bad Id!' }) })
    expect(res.status).toBe(404)
  })
})
