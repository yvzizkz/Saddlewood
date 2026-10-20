import { describe, expect, it } from 'vitest'

import type { IssuedProposal, SalesEvent } from '@/lib/sales/types'
import { eventText, needsCountersign, nextMonday, parseDollars, plusDays, proofChip, signatureChips, stageAge } from '../labels'

const P: IssuedProposal = {
  documentId: 'd',
  estimateId: null,
  number: 'EST-26-0001',
  revision: 1,
  totalCents: 1000000,
  issuedAt: '2026-10-10T16:00:00Z',
  status: 'issued',
  token: 't',
  views: 0,
  lastViewedAt: null,
  accepted: null,
  signatures: [],
  signing: 'none',
  executed: false,
}

function ev(kind: SalesEvent['kind'], detail: Record<string, unknown> = {}, text = ''): SalesEvent {
  return { id: 1, opportunityId: 'o', kind, at: '2026-10-10T16:00:00Z', actor: 'marco@x.com', text, detail }
}

describe('proofChip', () => {
  it('reads accepted, viewed, not opened, withdrawn', () => {
    expect(proofChip(null)).toBeNull()
    expect(proofChip(P)).toEqual({ tone: 'warn', text: 'Not opened' })
    expect(proofChip({ ...P, views: 1 })?.text).toBe('Viewed')
    expect(proofChip({ ...P, views: 3 })?.text).toBe('Viewed 3×')
    expect(proofChip({ ...P, views: 3, accepted: { at: '', name: 'A', packageName: 'B', totalCents: 1 } })?.text).toBe('Accepted')
    expect(proofChip({ ...P, status: 'void' })?.text).toBe('Withdrawn')
  })
})

describe('eventText', () => {
  it('says what happened in words', () => {
    expect(eventText(ev('stage', { from: 'lead', to: 'lost', reason: 'price' }))).toBe('Moved to Lost (Price)')
    expect(eventText(ev('issued', { revision: 2, totalCents: 1234500 }))).toBe('Proposal sent, rev 2, $12,345')
    expect(eventText(ev('accepted', { packageName: 'Signature', totalCents: 1234567 }))).toBe('Accepted Signature at $12,345.67')
    expect(eventText(ev('field', { by: 'Jose' }, 'Neighbor wants a patio'))).toBe('From Jose: Neighbor wants a patio')
    expect(eventText(ev('note', {}, 'Called, left a message'))).toBe('Called, left a message')
  })
})

describe('signatures', () => {
  const sig = (role: 'client' | 'company') => ({ role, name: role === 'client' ? 'Ana' : 'Marco', at: '2026-10-19T20:00:00Z', method: 'type' as const })
  it('says who has signed and who still has to', () => {
    expect(signatureChips(P)).toEqual([])
    expect(signatureChips({ ...P, signing: 'client' }).map((c) => c.text)).toEqual(['Awaiting client signature'])
    expect(signatureChips({ ...P, signing: 'both' }).map((c) => c.text)).toEqual(['Awaiting client signature', 'Awaiting our signature'])
    expect(signatureChips({ ...P, signing: 'both', signatures: [sig('client')] }).map((c) => c.text)).toEqual(['Client signed Oct 19', 'Awaiting our signature'])
    expect(signatureChips({ ...P, signing: 'both', signatures: [sig('client'), sig('company')], executed: true }).map((c) => c.text)).toEqual(['Fully signed'])
  })
  it('asks for a countersignature only when both sign and we have not', () => {
    expect(needsCountersign({ ...P, signing: 'both' })).toBe(true)
    expect(needsCountersign({ ...P, signing: 'client' })).toBe(false)
    expect(needsCountersign({ ...P, signing: 'both', signatures: [sig('company')] })).toBe(false)
    expect(needsCountersign({ ...P, signing: 'both', status: 'void' })).toBe(false)
  })
  it('reads signing and email lines', () => {
    expect(eventText(ev('signed', { role: 'client', name: 'Ana Hernandez' }))).toBe('Signed by Ana Hernandez')
    expect(eventText(ev('signed', { role: 'company', name: 'Marco' }))).toBe('Countersigned by Marco')
    expect(eventText(ev('emailed', { to: ['ana@x.com'], link: true, attachPdf: true }))).toBe('Proposal emailed to ana@x.com (link + PDF)')
  })
})

describe('dates and dollars', () => {
  it('moves days and finds next Monday', () => {
    expect(plusDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(nextMonday('2026-10-19')).toBe('2026-10-26') // a Monday goes a week on
    expect(nextMonday('2026-10-22')).toBe('2026-10-26')
  })

  it('reads dollars the way people type them', () => {
    expect(parseDollars('12,500')).toBe(1250000)
    expect(parseDollars('$12.5k')).toBe(1250000)
    expect(parseDollars('1.2m')).toBe(120000000)
    expect(parseDollars('')).toBeNull()
    expect(parseDollars('abc')).toBeNull()
  })

  it('shows the stage and its age', () => {
    expect(stageAge({ stage: 'lead', stageAt: '2026-10-15T18:00:00Z' }, '2026-10-19')).toBe('Lead · 4d')
    expect(stageAge({ stage: 'estimating', stageAt: '2026-10-19T15:00:00Z' }, '2026-10-19')).toBe('Estimating · today')
  })
})
