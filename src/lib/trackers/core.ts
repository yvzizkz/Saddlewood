import type { PreviousInvoiceItemKind, TrackerLine, TrackerState } from './types'
import { TRACKER_SCHEMA_VERSION } from './types'

// Arithmetic and wording of the progress payment tracker. Pure functions,
// shared by the page (live totals) and the API (workbook, email, roll-forward).
// Mirrors tracker_core() in the Powell Progress folder's build_tracker.py; the
// two are held identical by the workbook parity test.

const fmt0 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmt2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function N(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

export function cents(x: number): number {
  return Math.round(N(x) * 100) / 100
}

/** $1,234 when whole, $1,234.08 otherwise; unicode minus for negatives; +$ when `sign`. */
export function money(x: number, sign = false): string {
  const neg = x < -0.005
  const a = Math.abs(x)
  const whole = Math.abs(a - Math.round(a)) < 0.005
  return (neg ? '−$' : sign ? '+$' : '$') + (whole ? fmt0.format(Math.round(a)) : fmt2.format(a))
}

/** Always two decimals (totals). */
export function money2(x: number): string {
  return (x < -0.005 ? '−$' : '$') + fmt2.format(Math.abs(x))
}

export function pctStr(p: number): string {
  return (p * 100).toFixed(2) + '%'
}

export type LineStatus = 'complete' | 'partial' | 'normal' | 'tbd'

export type LineCalc = {
  contract: number
  co: number
  prior: number
  cp: number
  draw: number
  /** Current contract value: contract + change orders (column D). */
  D: number
  /** Completed to date: prior + this invoice. */
  completed: number
  status: LineStatus
  pct: number
  /** Previously performed (column F) = D × pct − this invoice. */
  F: number
  /** Current due this invoice (column G) = this invoice + draw. */
  G: number
  /** Total to date (column H) = F + G. */
  H: number
  remaining: number
}

export function lineCalc(line: TrackerLine): LineCalc {
  const contract = N(line.contract)
  const co = N(line.changeOrder)
  const prior = N(line.completedPrior)
  const cp = N(line.thisInvoice)
  const draw = N(line.draw)
  const D = contract + co
  const completed = prior + cp
  let status: LineStatus
  if (line.tbd) status = 'tbd'
  else if (D > 0 && completed >= D - 0.005) status = 'complete'
  else if (completed > 0) status = 'partial'
  else status = 'normal'
  const pct = status === 'complete' ? 1 : status === 'partial' ? (D ? completed / D : 0) : 0
  const F = D * pct - cp
  const G = cp + draw
  const H = F + G
  return { contract, co, prior, cp, draw, D, completed, status, pct, F, G, H, remaining: Math.max(D - completed, 0) }
}

/** A line that cannot be billed: TBD, or no contract value yet. */
export function unpriced(c: LineCalc): boolean {
  return c.status === 'tbd' || c.D <= 0
}

/** Billed (progress + draw) beyond what is left on the line. */
export function overBilled(c: LineCalc): boolean {
  return !unpriced(c) && c.cp + c.draw > c.D - c.prior + 0.005
}

/** Column A text on the workbook. */
export function displayDesc(line: TrackerLine, c: LineCalc): string {
  const name = line.name
  const note = line.note || ''
  let d: string
  if (c.status === 'complete') {
    d = '✔  ' + name + '   [100% COMPLETE'
    if (c.cp > 0) d += ' · ' + money(c.cp) + ' this invoice'
    d += ']' + note
  } else if (c.status === 'tbd') {
    d = name + '   [TBD — Pricing Pending]'
  } else if (c.status === 'partial') {
    d = name + '  (' + money(c.completed) + ' of ' + money(c.D) + ' completed'
    if (c.cp > 0) d += ' — ' + money(c.cp) + ' progress this invoice'
    d += note + ')'
  } else {
    d = name + note
  }
  if (c.draw > 0 && c.status !== 'tbd') d += '   + ' + money(c.draw) + ' draw this invoice'
  return d
}

export type TrackerSummary = {
  paid: number
  contract: number
  performed: number
  balance: number
  totalDue: number
  draws: number
  pct: number
  remaining: number
  sumG: number
  sumCp: number
  sumDraw: number
  sumCo: number
}

export function summary(state: TrackerState, calcs: LineCalc[] = state.lines.map(lineCalc)): TrackerSummary {
  const paid = state.payments.reduce((s, p) => s + N(p.amount), 0)
  const contract = calcs.reduce((s, c) => s + c.D, 0)
  const performed = calcs.reduce((s, c) => s + c.D * c.pct, 0)
  const toDate = calcs.reduce((s, c) => s + c.H, 0)
  const totalDue = toDate - paid
  const balance = performed - paid
  return {
    paid,
    contract,
    performed,
    balance,
    totalDue,
    draws: totalDue - balance,
    pct: contract ? performed / contract : 0,
    remaining: contract - performed,
    sumG: calcs.reduce((s, c) => s + c.G, 0),
    sumCp: calcs.reduce((s, c) => s + c.cp, 0),
    sumDraw: calcs.reduce((s, c) => s + c.draw, 0),
    sumCo: calcs.reduce((s, c) => s + c.co, 0),
  }
}

export function paidLabel(state: TrackerState): string {
  return 'Total Cash Paid to Date  (' + state.payments.length + ' payments received — see Payment Summary above)'
}

function itemTxt(it: { name: string; amount: number; kind: PreviousInvoiceItemKind }): string {
  if (it.kind === 'change order') return it.name + ' change order ' + money(N(it.amount))
  if (it.kind === 'draw') return it.name + ' ' + money(N(it.amount)) + ' advance draw'
  return it.name + ' ' + money(N(it.amount)) + ' progress'
}

/** The NOTES block, composed from the numbers. */
export function notesAuto(state: TrackerState, calcs: LineCalc[], s: TrackerSummary): string {
  const inv = state.invoice.number
  const prev = state.previousInvoice ?? null
  const lines = state.lines
  const n: string[] = []
  const add = (t: string) => n.push('(' + (n.length + 1) + ') ' + t)

  if (prev && prev.items && prev.items.length) {
    const billed = N(prev.total)
    const paidAmt = prev.paid == null ? billed : N(prev.paid)
    const diff = paidAmt - billed
    let how: string
    if (Math.abs(diff) < 0.005) how = 'paid Invoice #' + prev.number + ' in full'
    else if (diff < 0)
      how =
        'was applied to Invoice #' + prev.number + ' (' + money2(billed) + ' billed; ' + money2(-diff) + ' carried forward to this invoice)'
    else how = 'paid Invoice #' + prev.number + ' (' + money2(billed) + ' billed; ' + money2(diff) + ' overpayment carried as a credit)'
    add(
      'Owner payment of ' + money2(paidAmt) + ' received ' + (prev.paidDate || '') + ' ' + how +
        ' (' + prev.items.map(itemTxt).join(', ') +
        ' — all now recognized as completed work, no longer billed this invoice). Total cash paid to date: ' + money2(s.paid) + '.',
    )
  } else {
    add('Total cash paid to date: ' + money2(s.paid) + ' (see Payment Summary).')
  }

  const parts: string[] = []
  lines.forEach((l, i) => {
    const c = calcs[i]
    if (c.cp > 0) parts.push(l.name + ' ' + money(c.cp) + ' progress')
    if (c.draw > 0) parts.push(l.name + ' ' + money(c.draw) + ' advance draw')
  })
  const carry = s.totalDue - s.sumG
  if (carry > 0.005) parts.push('prior balance carried ' + money2(carry))
  else if (carry < -0.005) parts.push('less credit of ' + money2(-carry))
  if (parts.length) add('CURRENT DUE THIS INVOICE (#' + inv + ') = ' + money2(s.totalDue) + ':  ' + parts.join(' + ') + '.')
  else add('CURRENT DUE THIS INVOICE (#' + inv + ') = ' + money2(s.totalDue) + ' — no new billing this period.')

  const prevNames = new Set((prev?.items ?? []).map((it) => it.name))
  const prevShort = !!prev && prev.paid != null && N(prev.paid) < N(prev.total) - 0.005
  lines.forEach((l, i) => {
    const c = calcs[i]
    if (c.status !== 'partial') return
    const head = l.name.toUpperCase() + ': ' + money(c.completed) + ' of ' + money(c.D) + ' complete (' + pctStr(c.pct) + ') — '
    let tail: string
    if (c.cp > 0 && c.draw > 0) tail = money(c.cp) + ' billed this invoice for work completed + ' + money(c.draw) + ' advance draw.'
    else if (c.cp > 0) tail = money(c.cp) + ' billed this invoice for work completed.'
    else if (c.draw > 0) tail = money(c.draw) + ' advance draw this invoice.'
    else if (prev && prevNames.has(l.name) && prev.number && prevShort) tail = 'billed on Invoice #' + prev.number + ' (partially paid — see note 1); no new billing this invoice.'
    else if (prev && prevNames.has(l.name) && prev.number) tail = 'fully paid via Invoice #' + prev.number + '; no new billing this invoice.'
    else tail = 'no new billing this invoice.'
    add(head + tail)
  })

  const comp: string[] = []
  lines.forEach((l, i) => {
    const c = calcs[i]
    if (c.status !== 'complete' || c.D <= 0) return
    let t: string
    if (c.contract === 0 && c.co !== 0) t = l.name + ' ' + money(c.D) + ' (change order)'
    else if (c.co !== 0) t = l.name + ' ' + money(c.D) + ' (incl. ' + money(c.co, true) + ' change order)'
    else t = l.name + ' ' + money(c.D)
    if (c.cp > 0) t += ' — final ' + money(c.cp) + ' billed this invoice'
    comp.push(t)
  })
  if (comp.length) add('100% COMPLETE: ' + comp.join('; ') + '.')

  const cos: string[] = []
  lines.forEach((l, i) => {
    if (calcs[i].co !== 0) cos.push(l.name + ' ' + money(calcs[i].co, true))
  })
  if (cos.length) {
    add('Change orders to date: ' + cos.join(', ') + ' (net ' + money(calcs.reduce((a, c) => a + c.co, 0), true) + ').')
  }

  let t = 'Items marked TBD are pending owner decisions, change-order pricing, or site evaluation.'
  const pend = state.pendingChangeOrders ?? []
  if (pend.length) {
    t +=
      ' Pending change orders issued for owner approval (' + pend.join(', ') +
      ') are NOT reflected in this tracker and will be added only upon written owner approval.'
  }
  add(t)
  return 'NOTES:  ' + n.join('  ')
}

export function notesText(state: TrackerState, calcs: LineCalc[], s: TrackerSummary): string {
  if (state.notes && state.notes.mode === 'custom' && (state.notes.text || '').trim()) return state.notes.text.trim()
  return notesAuto(state, calcs, s)
}

/** Number literal for a formula, rounded to cents: 46000 not 46000.0, 23841.08 kept. */
export function numLit(x: number): string {
  return String(cents(x))
}

/** '3526-09' → '3526-10' (keeps the zero padding). */
export function nextInvoiceNumber(num: string): string {
  const m = /^(.*?)(\d+)$/.exec(num || '')
  if (!m) return (num || '') + '-01'
  return m[1] + String(parseInt(m[2], 10) + 1).padStart(m[2].length, '0')
}

/** MM/DD/YYYY in the given time zone (America/Phoenix by default: no DST). */
export function todayStr(now: Date = new Date(), timeZone = 'America/Phoenix'): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, month: '2-digit', day: '2-digit', year: 'numeric' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('month')}/${get('day')}/${get('year')}`
}

/**
 * "$1,234.50", "-2,100", "−2,100", "(2,100.00)" → cents-rounded number; blank → 0;
 * garbage (two dots, exponent, letters only) → NaN so the caller keeps the old value.
 */
export function parseMoney(input: string | number | null | undefined): number {
  if (typeof input === 'number') return Number.isFinite(input) ? cents(input) : NaN
  const s = String(input ?? '').trim()
  if (!s) return 0
  const neg = /^\(.*\)$/.test(s) || /^[$\s]*[-−]/.test(s)
  if (/[eE]/.test(s)) return NaN
  const digits = s.replace(/[^0-9.]/g, '')
  if (!digits || digits === '.' || (digits.match(/\./g) || []).length > 1) return NaN
  const v = parseFloat(digits)
  return Number.isFinite(v) ? cents(neg ? -v : v) : NaN
}

/** Lowercase id from a name, at most 60 characters so a uniqueness suffix still fits the 64-char limit. */
export function slug(s: string): string {
  const base = (s || 'line').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return (base.slice(0, 60).replace(/-+$/g, '') || 'line')
}

/** Fill defaults, coerce numbers to cents, and make line ids unique. Never throws. */
export function normalizeState(input: unknown): TrackerState {
  const s = (input && typeof input === 'object' ? input : {}) as Partial<TrackerState> & Record<string, unknown>
  const project = (s.project ?? {}) as Partial<TrackerState['project']>
  const invoice = (s.invoice ?? {}) as Partial<TrackerState['invoice']>
  const seen = new Set<string>()
  const lines: TrackerLine[] = (Array.isArray(s.lines) ? s.lines : []).map((raw) => {
    const l = (raw ?? {}) as Partial<TrackerLine>
    let id = (l.id && slug(l.id)) || slug(l.name ?? '')
    const base = id
    let k = 2
    while (seen.has(id)) id = `${base}-${k++}`
    seen.add(id)
    return {
      id,
      name: String(l.name ?? '').trim() || 'Line item',
      contract: cents(N(l.contract)),
      changeOrder: cents(N(l.changeOrder)),
      completedPrior: Math.max(0, cents(N(l.completedPrior))),
      thisInvoice: Math.max(0, cents(N(l.thisInvoice))),
      draw: Math.max(0, cents(N(l.draw))),
      tbd: !!l.tbd,
      note: String(l.note ?? ''),
    }
  })
  const payments = (Array.isArray(s.payments) ? s.payments : []).map((raw) => {
    const p = (raw ?? {}) as Partial<TrackerState['payments'][number]>
    return { label: String(p.label ?? ''), date: String(p.date ?? ''), amount: cents(N(p.amount)) }
  })
  const prevRaw = s.previousInvoice as PreviousInvoiceLike | null | undefined
  const previousInvoice = prevRaw && typeof prevRaw === 'object'
    ? {
        number: String(prevRaw.number ?? ''),
        total: cents(N(prevRaw.total)),
        ...(prevRaw.paid == null ? {} : { paid: cents(N(prevRaw.paid)) }),
        paidDate: String(prevRaw.paidDate ?? ''),
        items: (Array.isArray(prevRaw.items) ? prevRaw.items : []).map((it) => ({
          name: String(it?.name ?? ''),
          amount: cents(N(it?.amount)),
          kind: (it?.kind === 'draw' || it?.kind === 'change order' ? it.kind : 'progress') as PreviousInvoiceItemKind,
        })),
      }
    : null
  const notes = (s.notes ?? {}) as Partial<TrackerState['notes']>
  const meta = (s.meta ?? {}) as Partial<TrackerState['meta']>
  return {
    schemaVersion: TRACKER_SCHEMA_VERSION,
    project: {
      name: String(project.name ?? '').trim() || 'Project',
      contractor: String(project.contractor ?? ''),
      owners: String(project.owners ?? ''),
      address: String(project.address ?? ''),
      ...(project.invoicePrefix ? { invoicePrefix: String(project.invoicePrefix) } : {}),
    },
    invoice: {
      number: String(invoice.number ?? '').trim(),
      date: String(invoice.date ?? ''),
      status: invoice.status === 'issued' ? 'issued' : 'draft',
      ...(invoice.issuedAt ? { issuedAt: String(invoice.issuedAt) } : {}),
    },
    previousInvoice,
    payments,
    lines,
    pendingChangeOrders: (Array.isArray(s.pendingChangeOrders) ? s.pendingChangeOrders : []).map((x) => String(x)).filter(Boolean),
    notes: { mode: notes.mode === 'custom' ? 'custom' : 'auto', text: String(notes.text ?? '') },
    meta: { updatedAt: String(meta.updatedAt ?? ''), updatedBy: String(meta.updatedBy ?? '') },
  }
}

type PreviousInvoiceLike = {
  number?: unknown
  total?: unknown
  paid?: unknown
  paidDate?: unknown
  items?: { name?: unknown; amount?: unknown; kind?: unknown }[]
}

export type RollForwardInput = { amount: number; date: string; label: string }

/**
 * The owner paid this invoice: record the payment, fold this invoice's progress
 * and draws into completed work, remember what was billed for the notes, and
 * open the next invoice number as a draft. Returns a new state.
 */
export function rollForward(state: TrackerState, input: RollForwardInput, today: string = todayStr()): TrackerState {
  const calcs = state.lines.map(lineCalc)
  const s = summary(state, calcs)
  const items: PreviousInvoice['items'] = []
  state.lines.forEach((l, i) => {
    if (calcs[i].cp > 0) items.push({ name: l.name, amount: cents(calcs[i].cp), kind: 'progress' })
    if (calcs[i].draw > 0) items.push({ name: l.name, amount: cents(calcs[i].draw), kind: 'draw' })
  })
  return {
    ...state,
    previousInvoice: { number: state.invoice.number, total: cents(s.totalDue), paid: cents(input.amount), paidDate: input.date, items },
    payments: [...state.payments, { label: input.label, date: input.date, amount: cents(input.amount) }],
    lines: state.lines.map((l) => ({
      ...l,
      completedPrior: cents(N(l.completedPrior) + N(l.thisInvoice) + N(l.draw)),
      thisInvoice: 0,
      draw: 0,
    })),
    invoice: { number: nextInvoiceNumber(state.invoice.number), date: today, status: 'draft' },
    notes: state.notes.mode === 'custom' ? { mode: 'auto', text: '' } : state.notes,
  }
}

type PreviousInvoice = NonNullable<TrackerState['previousInvoice']>

/** Lines whose billed amount (progress + draw) exceeds what is left on the line. */
export function overBilledLines(state: TrackerState, calcs: LineCalc[] = state.lines.map(lineCalc)): TrackerLine[] {
  return state.lines.filter((_, i) => overBilled(calcs[i]))
}

/** Lines that carry an amount but cannot be billed (TBD or unpriced). */
export function unpricedBilledLines(state: TrackerState, calcs: LineCalc[] = state.lines.map(lineCalc)): TrackerLine[] {
  return state.lines.filter((_, i) => unpriced(calcs[i]) && calcs[i].G > 0)
}

export function workbookFilename(state: TrackerState): string {
  const first = (state.project.name || 'Project').split(/\s+/)[0].replace(/[^A-Za-z0-9]/g, '') || 'Project'
  return `${first}_Progress_Payment_Tracker.xlsx`
}
