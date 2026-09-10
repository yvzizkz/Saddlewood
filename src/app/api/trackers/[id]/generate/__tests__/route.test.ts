import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeState } from '@/lib/trackers/core'
import state08 from '@/lib/trackers/__tests__/fixtures/powell-3526-08.state.json'
import state09 from '@/lib/trackers/__tests__/fixtures/powell-3526-09.state.json'

const { getMock, saveMock, snapMock, sendMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  saveMock: vi.fn(),
  snapMock: vi.fn(),
  sendMock: vi.fn(),
}))
vi.mock('@/lib/trackers/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/trackers/queries')>('@/lib/trackers/queries')
  return { ...actual, getTracker: getMock, saveTracker: saveMock, saveInvoiceSnapshot: snapMock }
})
vi.mock('@/lib/auth/magicLink', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/magicLink')>('@/lib/auth/magicLink')
  return { ...actual, sendEmail: sendMock }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}))

import { POST } from '../route'

const TOKEN = 'test-token-with-enough-length-1234'
const due = normalizeState(state08) // $35,500 due
const zero = normalizeState(state09) // nothing due
const rec = (state: typeof due) => ({ id: 'powell', projectName: 'Powell Residence', invoiceNumber: state.invoice.number, state, updatedBy: 'x', updatedAt: '2026-09-10T00:00:00Z', createdAt: '2026-09-10T00:00:00Z' })

function req(body?: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/trackers/powell/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: 'powell' }) }
const auth = { Authorization: `Bearer ${TOKEN}` }

beforeEach(() => {
  getMock.mockReset()
  saveMock.mockReset()
  snapMock.mockReset()
  sendMock.mockReset()
  saveMock.mockImplementation(async (_id: string, st: typeof due, actor: string) => ({ ...rec(st), updatedBy: actor }))
  snapMock.mockImplementation(async (input: { state: typeof due; sentTo?: string | null; emailId?: string | null }) => ({
    id: 1,
    trackerId: 'powell',
    invoiceNumber: input.state.invoice.number,
    invoiceDate: input.state.invoice.date,
    totalDue: 35500,
    status: 'issued',
    generatedBy: 'agent',
    sentTo: input.sentTo ?? null,
    emailId: input.emailId ?? null,
    createdAt: '2026-09-10T00:00:00Z',
  }))
  sendMock.mockResolvedValue({ id: 'resend-123' })
  vi.stubEnv('OPS_AGENT_TOKEN', TOKEN)
  vi.stubEnv('MARCO_EMAIL', 'marco@saddlewoodcontracting.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('generate', () => {
  it('refuses anonymous callers', async () => {
    getMock.mockResolvedValue(rec(due))
    expect((await POST(req({}) as never, ctx)).status).toBe(401)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('builds the workbook, emails it to Marco with the attachment, snapshots, and marks issued', async () => {
    getMock.mockResolvedValue(rec(due))
    const res = await POST(req({}, auth) as never, ctx)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sentTo).toEqual(['marco@saddlewoodcontracting.com'])
    expect(json.emailId).toBe('resend-123')
    expect(json.filename).toBe('Powell_Progress_Payment_Tracker.xlsx')
    expect(json.download).toBe('/api/trackers/powell/workbook?invoice=3526-08')
    const mail = sendMock.mock.calls[0][0]
    expect(mail.to).toBe('marco@saddlewoodcontracting.com')
    expect(mail.subject).toContain('#3526-08')
    expect(mail.subject).toContain('$35,500.00')
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments[0].filename).toBe('Powell_Progress_Payment_Tracker.xlsx')
    expect(Buffer.from(mail.attachments[0].content, 'base64').subarray(0, 2).toString()).toBe('PK')
    // marked issued before the snapshot
    const issuedSave = saveMock.mock.calls.find((c) => c[1].invoice.status === 'issued')
    expect(issuedSave).toBeTruthy()
    expect(snapMock).toHaveBeenCalledWith(expect.objectContaining({ trackerId: 'powell', sentTo: 'marco@saddlewoodcontracting.com', emailId: 'resend-123' }))
  })

  it('stops on a $0 invoice unless forced', async () => {
    getMock.mockResolvedValue(rec(zero))
    const res = await POST(req({}, auth) as never, ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('zero_due')
    expect(sendMock).not.toHaveBeenCalled()
    const forced = await POST(req({ force: true }, auth) as never, ctx)
    expect(forced.status).toBe(200)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('refuses amounts on unpriced lines even when forced', async () => {
    const bad = { ...due, lines: due.lines.map((l) => (l.id === 'attic' ? { ...l, thisInvoice: 100 } : l)) }
    getMock.mockResolvedValue(rec(bad))
    const res = await POST(req({ force: true }, auth) as never, ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('unpriced')
  })

  it('only copies allowlisted extra recipients', async () => {
    getMock.mockResolvedValue(rec(due))
    const res = await POST(req({ to: ['someone@example.com'] }, auth) as never, ctx)
    expect(res.status).toBe(403)
    const ok = await POST(req({ to: ['lando@saddlewoodcontracting.com'] }, auth) as never, ctx)
    expect(ok.status).toBe(200)
    expect(sendMock.mock.calls[0][0].cc).toEqual(['lando@saddlewoodcontracting.com'])
  })

  it('can build without sending', async () => {
    getMock.mockResolvedValue(rec(due))
    const res = await POST(req({ send: false }, auth) as never, ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).sentTo).toEqual([])
    expect(sendMock).not.toHaveBeenCalled()
    expect(snapMock).toHaveBeenCalled()
  })
})
