import { describe, expect, it } from 'vitest'

import {
  displayDesc,
  lineCalc,
  money,
  money2,
  nextInvoiceNumber,
  normalizeState,
  notesAuto,
  numLit,
  overBilledLines,
  parseMoney,
  rollForward,
  summary,
  unpricedBilledLines,
  workbookFilename,
} from '../core'
import type { TrackerLine, TrackerState } from '../types'
import { trackerStateSchema } from '../types'
import state08 from './fixtures/powell-3526-08.state.json'
import state09 from './fixtures/powell-3526-09.state.json'

const s08 = normalizeState(state08)
const s09 = normalizeState(state09)

function line(over: Partial<TrackerLine>): TrackerLine {
  return { id: 'x', name: 'X', contract: 0, changeOrder: 0, completedPrior: 0, thisInvoice: 0, draw: 0, tbd: false, note: '', ...over }
}

describe('money formatting', () => {
  it('drops cents on whole dollars and keeps them otherwise', () => {
    expect(money(15015)).toBe('$15,015')
    expect(money(23841.08)).toBe('$23,841.08')
    expect(money(14368.5)).toBe('$14,368.50')
    expect(money(-15000)).toBe('−$15,000')
    expect(money(10000, true)).toBe('+$10,000')
    expect(money2(35500)).toBe('$35,500.00')
    expect(money2(-0.001)).toBe('$0.00')
  })
  it('numLit rounds to cents and prints like Python repr', () => {
    expect(numLit(46000)).toBe('46000')
    expect(numLit(23841.08)).toBe('23841.08')
    expect(numLit(0.1 + 0.2)).toBe('0.3')
  })
})

describe('lineCalc', () => {
  it('classifies complete, partial, not started, and TBD', () => {
    expect(lineCalc(line({ contract: 27300, changeOrder: 10000, completedPrior: 37300 })).status).toBe('complete')
    const k = lineCalc(line({ contract: 89512, completedPrior: 20000, thisInvoice: 19000 }))
    expect(k.status).toBe('partial')
    expect(k.completed).toBe(39000)
    expect(k.F).toBeCloseTo(20000, 6)
    expect(k.G).toBe(19000)
    expect(k.H).toBeCloseTo(39000, 6)
    expect(k.remaining).toBe(50512)
    expect(lineCalc(line({ contract: 13492 })).status).toBe('normal')
    expect(lineCalc(line({ tbd: true })).status).toBe('tbd')
  })
  it('never divides by zero on an unpriced line', () => {
    const c = lineCalc(line({ contract: 0, thisInvoice: 500 }))
    expect(c.pct).toBe(0)
    expect(Number.isFinite(c.F)).toBe(true)
  })
})

describe('displayDesc', () => {
  it('matches the hand-written tracker wording', () => {
    const crawl = line({ name: 'Crawl Space', contract: 15015, completedPrior: 10000 })
    expect(displayDesc(crawl, lineCalc(crawl))).toBe('Crawl Space  ($10,000 of $15,015 completed)')
    const kitchen = line({ name: 'Kitchen', contract: 89512, completedPrior: 20000, thisInvoice: 19000 })
    expect(displayDesc(kitchen, lineCalc(kitchen))).toBe('Kitchen  ($39,000 of $89,512 completed — $19,000 progress this invoice)')
    const attic = line({ name: 'Attic', tbd: true })
    expect(displayDesc(attic, lineCalc(attic))).toBe('Attic   [TBD — Pricing Pending]')
    const stucco = line({ name: 'Stucco', contract: 27300, changeOrder: 10000, completedPrior: 37300 })
    expect(displayDesc(stucco, lineCalc(stucco))).toBe('✔  Stucco   [100% COMPLETE]')
    const fire = line({ name: 'Fireplaces', contract: 28087, draw: 5000 })
    expect(displayDesc(fire, lineCalc(fire))).toBe('Fireplaces   + $5,000 draw this invoice')
  })
})

describe('summary on the real Powell states', () => {
  it('#3526-08: $35,500 due, nothing carried', () => {
    const s = summary(s08)
    expect(s.contract).toBeCloseTo(767209.22, 2)
    expect(s.performed).toBeCloseTo(490836.3, 2)
    expect(s.paid).toBeCloseTo(455336.3, 2)
    expect(s.totalDue).toBeCloseTo(35500, 2)
    expect(s.draws).toBeCloseTo(0, 6)
    expect(s.pct).toBeCloseTo(0.639769, 5)
  })
  it('#3526-09: paid in full, nothing due yet', () => {
    const s = summary(s09)
    expect(s.paid).toBeCloseTo(490836.3, 2)
    expect(s.totalDue).toBeCloseTo(0, 6)
    expect(s.remaining).toBeCloseTo(276372.92, 2)
  })
})

describe('notes', () => {
  it('says paid in full only when the payment matched the invoice', () => {
    const calcs = s09.lines.map(lineCalc)
    const full = notesAuto(s09, calcs, summary(s09, calcs))
    expect(full).toContain('paid Invoice #3526-08 in full')
    const short: TrackerState = { ...s09, previousInvoice: { ...s09.previousInvoice!, paid: 30000 } }
    const txt = notesAuto(short, calcs, summary(short, calcs))
    expect(txt).toContain('was applied to Invoice #3526-08 ($35,500.00 billed; $5,500.00 carried forward to this invoice)')
    expect(txt).not.toContain('in full')
  })
})

describe('roll-forward', () => {
  it('folds billed work into completed and opens the next invoice', () => {
    const next = rollForward(s08, { amount: 35500, date: '09/01/2026', label: 'Owner Payment — Inv #3526-08' }, '09/09/2026')
    expect(next.invoice).toEqual({ number: '3526-09', date: '09/09/2026', status: 'draft' })
    expect(next.payments).toHaveLength(9)
    expect(next.payments[8].amount).toBe(35500)
    const kitchen = next.lines.find((l) => l.id === 'kitchen')!
    expect(kitchen.completedPrior).toBe(39000)
    expect(kitchen.thisInvoice).toBe(0)
    expect(next.previousInvoice?.number).toBe('3526-08')
    expect(next.previousInvoice?.total).toBe(35500)
    expect(next.previousInvoice?.items.map((i) => i.name)).toEqual(['Kitchen', 'Guest Bath', 'Laundry Room', 'Painting & Baseboards'])
    expect(summary(next).totalDue).toBeCloseTo(0, 6)
    // the fixture for #3526-09 was produced by exactly this roll-forward
    expect(next.lines.map((l) => [l.id, l.completedPrior])).toEqual(s09.lines.map((l) => [l.id, l.completedPrior]))
  })
  it('increments invoice numbers with padding', () => {
    expect(nextInvoiceNumber('3526-09')).toBe('3526-10')
    expect(nextInvoiceNumber('3526-99')).toBe('3526-100')
    expect(nextInvoiceNumber('INV-007')).toBe('INV-008')
    expect(nextInvoiceNumber('draft')).toBe('draft-01')
  })
})

describe('guards', () => {
  it('flags over-billing and amounts on unpriced lines', () => {
    const st: TrackerState = {
      ...s09,
      lines: s09.lines.map((l) => (l.id === 'drywall' ? { ...l, thisInvoice: 2000 } : l.id === 'attic' ? { ...l, thisInvoice: 100 } : l)),
    }
    expect(overBilledLines(st).map((l) => l.id)).toEqual(['drywall'])
    expect(unpricedBilledLines(st).map((l) => l.id)).toEqual(['attic'])
  })
})

describe('parseMoney', () => {
  it('reads what people type and paste', () => {
    expect(parseMoney('$1,234.50')).toBe(1234.5)
    expect(parseMoney('5000')).toBe(5000)
    expect(parseMoney('-2,100')).toBe(-2100)
    expect(parseMoney('−2,100')).toBe(-2100)
    expect(parseMoney('($24,500.00)')).toBe(-24500)
    expect(parseMoney('')).toBe(0)
    expect(parseMoney('1e3')).toBeNaN()
    expect(parseMoney('1.2.3')).toBeNaN()
    expect(parseMoney('abc')).toBeNaN()
  })
})

describe('normalizeState and schema', () => {
  it('accepts both fixtures unchanged', () => {
    expect(trackerStateSchema.safeParse(s08).success).toBe(true)
    expect(trackerStateSchema.safeParse(s09).success).toBe(true)
  })
  it('dedupes line ids and fills defaults', () => {
    const st = normalizeState({ lines: [{ name: 'Kitchen' }, { name: 'Kitchen' }], invoice: { number: '1' } })
    expect(st.lines.map((l) => l.id)).toEqual(['kitchen', 'kitchen-2'])
    expect(st.project.name).toBe('Project')
    expect(st.notes).toEqual({ mode: 'auto', text: '' })
    expect(workbookFilename(st)).toBe('Project_Progress_Payment_Tracker.xlsx')
    expect(workbookFilename(s09)).toBe('Powell_Progress_Payment_Tracker.xlsx')
  })
})
