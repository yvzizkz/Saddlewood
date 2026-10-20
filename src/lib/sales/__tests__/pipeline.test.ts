import { describe, expect, it } from 'vitest'

import { agenda, daysSince, metrics, probabilityOf, valueOf, type OpportunityRow } from '../pipeline'
import type { IssuedProposal } from '../types'

const TODAY = '2026-10-19'

let n = 0
function row(over: Partial<OpportunityRow> = {}): OpportunityRow {
  n += 1
  return {
    id: `o${n}`,
    number: `26-${String(n).padStart(4, '0')}`,
    title: `Job ${n}`,
    stage: 'qualified',
    kind: 'remodel',
    source: 'call',
    contact: { name: 'A' },
    address: '',
    clientId: null,
    jobId: null,
    valueCents: 1000000,
    probability: null,
    owner: '',
    nextStep: '',
    nextStepOn: null,
    bidDue: null,
    lostReason: '',
    notes: '',
    tags: [],
    externalRef: null,
    createdBy: '',
    createdAt: '2026-10-18T15:00:00Z',
    updatedAt: '2026-10-19T15:00:00Z',
    stageAt: '2026-10-18T15:00:00Z',
    closedAt: null,
    estimateCents: null,
    proposal: null,
    lastActivityAt: '2026-10-19T15:00:00Z',
    ...over,
  }
}

function proposal(over: Partial<IssuedProposal> = {}): IssuedProposal {
  return {
    documentId: 'd',
    estimateId: null,
    number: 'EST',
    revision: 1,
    totalCents: 2000000,
    issuedAt: '2026-10-10T15:00:00Z',
    status: 'issued',
    token: 't',
    views: 0,
    lastViewedAt: null,
    accepted: null,
    signatures: [],
    signing: 'none',
    executed: false,
    ...over,
  }
}

describe('valueOf and probabilityOf', () => {
  it('takes the accepted price, then the sent price, then the estimate, then the guess', () => {
    expect(valueOf(row())).toBe(1000000)
    expect(valueOf(row({ estimateCents: 1500000 }))).toBe(1500000)
    expect(valueOf(row({ estimateCents: 1500000, proposal: proposal() }))).toBe(2000000)
    expect(valueOf(row({ proposal: proposal({ accepted: { at: '', name: '', packageName: '', totalCents: 2500000 } }) }))).toBe(2500000)
  })

  it("uses the stage's number unless one was set by hand", () => {
    expect(probabilityOf(row({ stage: 'negotiating' }))).toBe(70)
    expect(probabilityOf(row({ stage: 'negotiating', probability: 90 }))).toBe(90)
  })
})

describe('daysSince', () => {
  it('counts Phoenix calendar days', () => {
    // 2026-10-19 02:00Z is still the 18th in Phoenix.
    expect(daysSince('2026-10-19T02:00:00Z', TODAY)).toBe(1)
    expect(daysSince('2026-10-12', TODAY)).toBe(7)
  })
})

describe('agenda', () => {
  it('names the most pressing reason for each opportunity, most urgent first', () => {
    const rows = [
      row({ title: 'stale', lastActivityAt: '2026-10-01T15:00:00Z', updatedAt: '2026-10-01T15:00:00Z' }),
      row({ title: 'overdue', nextStep: 'Call back', nextStepOn: '2026-10-16' }),
      row({ title: 'today', nextStep: 'Site walk', nextStepOn: TODAY }),
      row({ title: 'new', stage: 'lead', createdAt: '2026-10-17T15:00:00Z', lastActivityAt: '2026-10-17T15:00:00Z' }),
      row({ title: 'bid', stage: 'estimating', bidDue: '2026-10-21' }),
      row({ title: 'quiet', stage: 'proposal_sent', proposal: proposal({ views: 3 }), lastActivityAt: '2026-10-12T15:00:00Z' }),
      row({ title: 'unopened', stage: 'proposal_sent', proposal: proposal({ issuedAt: '2026-10-16T15:00:00Z' }), lastActivityAt: '2026-10-16T15:00:00Z' }),
      row({ title: 'accepted', stage: 'won', closedAt: '2026-10-19T15:00:00Z', proposal: proposal({ accepted: { at: '', name: '', packageName: '', totalCents: 1 } }) }),
      row({ title: 'fine' }),
      row({ title: 'lost', stage: 'lost', closedAt: '2026-10-01T15:00:00Z', nextStepOn: '2026-10-01' }),
    ]
    const got = agenda(rows, TODAY).map((a) => [a.row.title, a.reason])
    expect(got).toEqual([
      ['accepted', 'accepted'],
      ['overdue', 'overdue'],
      ['bid', 'bid_due'],
      ['new', 'new_lead'],
      ['today', 'today'],
      ['quiet', 'viewed_quiet'],
      ['unopened', 'not_viewed'],
      ['stale', 'stale'],
    ])
    expect(agenda(rows, TODAY).find((a) => a.reason === 'overdue')?.label).toBe('Call back: 3d late')
  })

  it('drops an accepted job once it is opened', () => {
    const r = row({ stage: 'won', jobId: 'j', proposal: proposal({ accepted: { at: '', name: '', packageName: '', totalCents: 1 } }) })
    expect(agenda([r], TODAY)).toEqual([])
  })
})

describe('metrics', () => {
  it('sums the open pipeline, weights it, and scores the last 90 days', () => {
    const rows = [
      row({ stage: 'lead', valueCents: 1000000 }), // 10%
      row({ stage: 'negotiating', valueCents: 2000000 }), // 70%
      row({ stage: 'won', valueCents: 3000000, createdAt: '2026-09-01T15:00:00Z', closedAt: '2026-09-21T15:00:00Z' }),
      row({ stage: 'won', valueCents: 500000, createdAt: '2026-10-01T15:00:00Z', closedAt: '2026-10-11T15:00:00Z' }),
      row({ stage: 'lost', valueCents: 900000, closedAt: '2026-10-05T15:00:00Z' }),
      row({ stage: 'lost', valueCents: 900000, closedAt: '2026-05-01T15:00:00Z' }), // older than 90 days
    ]
    const m = metrics(rows, TODAY)
    expect(m.openCount).toBe(2)
    expect(m.openCents).toBe(3000000)
    expect(m.weightedCents).toBe(100000 + 1400000)
    expect(m.wonCount90).toBe(2)
    expect(m.wonCents90).toBe(3500000)
    expect(m.lostCount90).toBe(1)
    expect(m.winRate90).toBe(67)
    expect(m.medianDaysToWin).toBe(10)
  })

  it('has no win rate with nothing decided', () => {
    expect(metrics([row()], TODAY).winRate90).toBeNull()
  })
})
