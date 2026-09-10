'use client'

import { useState } from 'react'
import { ChevronDown, Pencil } from 'lucide-react'

import { money, money2, overBilled, parseMoney, pctStr, unpriced, type LineCalc, type LineStatus, type TrackerSummary } from '@/lib/trackers/core'
import type { TrackerLine } from '@/lib/trackers/types'
import type { AmountField } from './AmountSheet'
import { DUE_RED, fmt, H2, selectOnFocus, STATUS_LABEL, STATUS_STYLE } from './format'

type Props = {
  lines: TrackerLine[]
  calcs: LineCalc[]
  s: TrackerSummary
  onAmount: (lineId: string, field: AmountField, value: number) => void
  onOpenAmount: (line: TrackerLine, field: AmountField) => void
  onEdit: (line: TrackerLine | null) => void
  onBillRemaining: (lineId: string) => void
}

type Filter = 'open' | LineStatus | 'all'

// "Open" (the default) is what Marco bills from: lines in progress or not
// started, in the workbook's order. Complete and TBD lines sit under a
// disclosure at the bottom; "All" lists everything in the workbook's order.
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'partial', label: 'In progress' },
  { key: 'normal', label: 'Not started' },
  { key: 'complete', label: 'Complete' },
  { key: 'tbd', label: 'TBD' },
  { key: 'all', label: 'All' },
]

const isOpen = (st: LineStatus) => st === 'partial' || st === 'normal'

function StatusChip({ status }: { status: LineStatus }) {
  const st = STATUS_STYLE[status]
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap" style={{ backgroundColor: st.bg, color: st.fg }}>
      {STATUS_LABEL[status]}
    </span>
  )
}

function Bar({ c }: { c: LineCalc }) {
  const D = c.D || 1
  const w = (x: number) => `${(Math.min(1, Math.max(0, x / D)) * 100).toFixed(2)}%`
  return (
    <div className="h-1.5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--color-stone)' }} aria-hidden="true">
      <i className="block h-full" style={{ width: w(c.prior), backgroundColor: '#2f6b4a' }} />
      <i className="block h-full" style={{ width: w(c.cp), backgroundColor: 'var(--color-gold)' }} />
      <i className="block h-full" style={{ width: w(c.draw), backgroundImage: 'repeating-linear-gradient(45deg, var(--color-gold) 0 3px, transparent 3px 6px)' }} />
    </div>
  )
}

/** Desktop inline money input: whole value selected on focus, live totals on every keystroke, tidy format on blur. */
function MoneyInput({ value, disabled, over, label, onChange }: { value: number; disabled?: boolean; over?: boolean; label: string; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const shown = draft ?? (value ? money2(value) : '')
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      disabled={disabled}
      value={shown}
      placeholder="$0.00"
      title={bad ? 'Enter a dollar amount, e.g. 5,000' : over ? 'More than the remaining value on this line' : undefined}
      onFocus={selectOnFocus}
      onChange={(e) => {
        setDraft(e.target.value)
        const v = parseMoney(e.target.value)
        if (Number.isNaN(v) || v < 0) {
          setBad(true)
          return
        }
        setBad(false)
        onChange(v)
      }}
      onBlur={() => {
        setDraft(null)
        setBad(false)
      }}
      className="w-full text-right tabular-nums text-sm bg-transparent border-0 border-b py-2 px-1 outline-none focus:bg-white disabled:opacity-40 min-h-[40px]"
      style={{ borderColor: bad || over ? DUE_RED : 'var(--color-stone-mid)', color: bad || over ? DUE_RED : value > 0 ? DUE_RED : 'var(--color-charcoal)', fontWeight: value > 0 ? 600 : 400 }}
    />
  )
}

const FIGURES: { key: keyof LineCalc | 'co'; label: string }[] = [
  { key: 'contract', label: 'Contract' },
  { key: 'co', label: 'Change orders' },
  { key: 'D', label: 'Current total' },
  { key: 'F', label: 'Previously performed' },
  { key: 'G', label: 'Current due' },
  { key: 'H', label: 'Total to date' },
]

/** One line item, stacked for the phone: the workbook's columns in reading order, then the two amounts to enter. */
function LineCard({ line, c, onOpenAmount, onEdit, onBillRemaining }: { line: TrackerLine; c: LineCalc; onOpenAmount: Props['onOpenAmount']; onEdit: Props['onEdit']; onBillRemaining: Props['onBillRemaining'] }) {
  const locked = unpriced(c)
  const remaining = Math.max(0, c.remaining - c.draw)
  const over = overBilled(c)
  return (
    <article
      className="rounded-lg border bg-white p-3"
      style={{ borderColor: c.G > 0 ? 'var(--color-gold)' : 'var(--color-stone)', boxShadow: c.G > 0 ? 'inset 4px 0 0 var(--color-gold)' : undefined, opacity: c.status === 'tbd' ? 0.85 : 1 }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-base leading-snug text-[var(--color-charcoal)] line-clamp-2 break-words" style={{ fontFamily: 'var(--font-fraunces)' }}>
            {line.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusChip status={c.status} />
            {!locked ? (
              <span className="text-xs tabular-nums" style={{ color: 'var(--color-charcoal-light)' }}>
                {money(c.completed)} of {money(c.D)} · {pctStr(c.pct)}
              </span>
            ) : null}
          </div>
        </div>
        <button type="button" onClick={() => onEdit(line)} aria-label={`Edit ${line.name}`} className="shrink-0 size-11 -mr-1 -mt-1 rounded-full flex items-center justify-center text-[var(--color-charcoal-light)] hover:bg-[var(--color-cream)]">
          <Pencil className="size-4" aria-hidden="true" />
        </button>
      </div>

      {!locked ? (
        <div className="mt-2">
          <Bar c={c} />
        </div>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs tabular-nums">
        {FIGURES.map(({ key, label }) => {
          const v = key === 'co' ? (c.co ? money(c.co, true) : '—') : fmt(c[key as keyof LineCalc] as number)
          const color = key === 'co' ? (c.co > 0 ? '#7a5d16' : c.co < 0 ? DUE_RED : undefined) : key === 'G' && c.G > 0 ? DUE_RED : undefined
          return (
            <div key={key} className="min-w-0 flex items-baseline justify-between gap-2 border-b pb-1" style={{ borderColor: 'var(--color-cream)' }}>
              <dt className="text-[10px] uppercase tracking-[0.06em] leading-tight" style={{ color: 'var(--color-charcoal-light)' }}>
                {label}
              </dt>
              <dd className="text-[var(--color-charcoal)] whitespace-nowrap" style={{ color, fontWeight: color ? 600 : 400 }}>
                {v}
              </dd>
            </div>
          )
        })}
      </dl>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(['thisInvoice', 'draw'] as AmountField[]).map((field) => {
          const v = field === 'thisInvoice' ? c.cp : c.draw
          const disabled = locked || (field === 'draw' && c.status === 'complete' && !c.draw)
          return (
            <button
              key={field}
              type="button"
              disabled={disabled}
              onClick={() => onOpenAmount(line, field)}
              className="rounded-lg border px-3 py-2.5 text-left min-h-[60px] disabled:opacity-40 active:bg-[var(--color-cream)]"
              style={{ borderColor: v > 0 ? 'var(--color-gold)' : 'var(--color-stone)', backgroundColor: v > 0 ? 'rgba(212,175,55,0.10)' : 'transparent' }}
              aria-label={`${field === 'thisInvoice' ? 'This invoice' : 'Draw'} for ${line.name}: ${fmt(v)}`}
            >
              <span className="block text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--color-charcoal-light)' }}>
                {field === 'thisInvoice' ? 'This invoice' : 'Draw'}
              </span>
              <span className="block text-lg tabular-nums leading-tight" style={{ fontFamily: 'var(--font-fraunces)', color: v > 0 ? DUE_RED : 'var(--color-charcoal)' }}>
                {v > 0 ? fmt(v) : '$0.00'}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-xs min-h-[36px]">
        <span className="tabular-nums" style={{ color: over ? DUE_RED : 'var(--color-charcoal-light)' }}>
          {locked ? 'Price this line to bill it' : over ? 'Billed more than what is left on this line' : `Remaining ${fmt(remaining)}`}
        </span>
        {!locked && remaining > 0.005 ? (
          <button type="button" onClick={() => onBillRemaining(line.id)} className="underline min-h-[44px] px-2 -mr-2" style={{ color: 'var(--color-teal)' }}>
            Bill remaining
          </button>
        ) : null}
      </div>
    </article>
  )
}

function Row({ line, c, onAmount, onEdit, onBillRemaining }: { line: TrackerLine; c: LineCalc; onAmount: Props['onAmount']; onEdit: Props['onEdit']; onBillRemaining: Props['onBillRemaining'] }) {
  const locked = unpriced(c)
  const remaining = Math.max(0, c.remaining - c.draw)
  const over = overBilled(c)
  return (
    <tr className="border-t align-middle" style={{ borderColor: 'var(--color-stone)', backgroundColor: c.G > 0 ? 'rgba(212,175,55,0.10)' : undefined }}>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1 min-w-0">
          <span className="truncate text-[var(--color-charcoal)] font-medium" title={line.name}>
            {line.name}
          </span>
          <button type="button" onClick={() => onEdit(line)} aria-label={`Edit ${line.name}`} className="shrink-0 size-9 rounded-full flex items-center justify-center text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)] hover:bg-[var(--color-cream)]">
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-0.5">
          <StatusChip status={c.status} />
        </div>
      </td>
      <td className="px-2 py-2 text-right text-[var(--color-charcoal)]">{fmt(c.contract)}</td>
      <td className="px-2 py-2 text-right" style={{ color: c.co > 0 ? '#7a5d16' : c.co < 0 ? DUE_RED : 'var(--color-charcoal-light)' }}>
        {c.co ? money(c.co, true) : '—'}
      </td>
      <td className="px-2 py-2 text-right text-[var(--color-charcoal)] font-medium">{fmt(c.D)}</td>
      <td className="px-2 py-2">
        {locked ? (
          <span className="text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
            Pricing pending
          </span>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between gap-2 text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
              <span className="truncate">
                <b className="text-[var(--color-charcoal)] font-medium">{money(c.completed)}</b> {c.status === 'complete' ? 'complete' : `of ${money(c.D)}`}
              </span>
              <span>{pctStr(c.pct)}</span>
            </div>
            <Bar c={c} />
          </div>
        )}
      </td>
      <td className="px-2 py-2">
        <MoneyInput value={c.cp} disabled={locked} over={over} label={`This invoice amount for ${line.name}`} onChange={(v) => onAmount(line.id, 'thisInvoice', v)} />
      </td>
      <td className="px-2 py-2">
        <MoneyInput value={c.draw} disabled={locked || (c.status === 'complete' && !c.draw)} over={over && c.draw > 0} label={`Advance draw for ${line.name}`} onChange={(v) => onAmount(line.id, 'draw', v)} />
      </td>
      <td className="px-2 py-2 text-right">
        <div className="text-[var(--color-charcoal)]">{locked ? '—' : fmt(remaining)}</div>
        {!locked && remaining > 0.005 ? (
          <button type="button" onClick={() => onBillRemaining(line.id)} className="text-xs underline min-h-[28px]" style={{ color: 'var(--color-teal)' }}>
            Bill remaining
          </button>
        ) : null}
      </td>
    </tr>
  )
}

export function LinesSection({ lines, calcs, s, onAmount, onOpenAmount, onEdit, onBillRemaining }: Props) {
  const [filter, setFilter] = useState<Filter>('open')
  const all = lines.map((line, i) => ({ line, c: calcs[i] }))
  const rows = all.filter((r) => filter === 'all' || filter === 'open' ? filter === 'all' || isOpen(r.c.status) : r.c.status === filter)
  const parked = filter === 'open' ? all.filter((r) => !isOpen(r.c.status)) : []
  const parkedComplete = parked.filter((r) => r.c.status === 'complete').length
  const parkedTbd = parked.length - parkedComplete
  const parkedLabel = [parkedComplete ? `${parkedComplete} complete` : '', parkedTbd ? `${parkedTbd} TBD` : ''].filter(Boolean).join(' · ')
  const sumB = calcs.reduce((a, c) => a + c.contract, 0)

  const chips = (
    <div role="group" aria-label="Filter lines" className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 md:mx-0 md:px-0 md:flex-wrap">
      {FILTERS.map((f) => {
        const active = filter === f.key
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={active}
            onClick={() => setFilter(f.key)}
            className="text-sm px-3.5 min-h-[40px] rounded-full border transition-colors whitespace-nowrap shrink-0"
            style={{ borderColor: active ? 'var(--color-teal)' : 'var(--color-stone)', backgroundColor: active ? 'var(--color-teal)' : 'transparent', color: active ? 'white' : 'var(--color-charcoal)' }}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )

  const parkedHeading = parked.length ? (
    <summary className="list-none cursor-pointer flex items-center justify-between gap-2 min-h-[44px] px-1 text-sm" style={{ color: 'var(--color-charcoal)' }}>
      <span>
        <b className="font-medium">Complete &amp; TBD</b> <span style={{ color: 'var(--color-charcoal-light)' }}>· {parkedLabel} · nothing to bill</span>
      </span>
      <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" style={{ color: 'var(--color-charcoal-light)' }} />
    </summary>
  ) : null

  return (
    <section aria-labelledby="sov-heading" className="rounded-lg border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
      <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
        <div>
          <h2 id="sov-heading" className={H2} style={{ fontFamily: 'var(--font-fraunces)' }}>
            Schedule of values
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-charcoal-light)' }}>
            Tap <b>This invoice</b> to bill completed work, or <b>Draw</b> for an advance. Totals update as you go.
          </p>
        </div>
        {chips}
      </div>

      {/* Phone and tablet: stacked cards on a cream ground */}
      <div className="xl:hidden px-3 py-3 flex flex-col gap-3 rounded-b-lg" style={{ backgroundColor: 'var(--color-cream)' }}>
        {rows.map(({ line, c }) => (
          <LineCard key={line.id} line={line} c={c} onOpenAmount={onOpenAmount} onEdit={onEdit} onBillRemaining={onBillRemaining} />
        ))}
        {rows.length === 0 ? (
          <p className="text-sm px-1 py-3" style={{ color: 'var(--color-charcoal-light)' }}>
            No line items match this filter.
          </p>
        ) : null}
        {parked.length ? (
          <details className="group rounded-lg border bg-white px-3 py-1" style={{ borderColor: 'var(--color-stone)' }}>
            {parkedHeading}
            <div className="flex flex-col gap-3 pb-3 pt-1">
              {parked.map(({ line, c }) => (
                <LineCard key={line.id} line={line} c={c} onOpenAmount={onOpenAmount} onEdit={onEdit} onBillRemaining={onBillRemaining} />
              ))}
            </div>
          </details>
        ) : null}
        <button type="button" onClick={() => onEdit(null)} className="self-start text-sm px-3.5 min-h-[44px] rounded-lg border bg-white" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}>
          + Add a line item
        </button>
      </div>

      {/* Desktop: the workbook's columns */}
      <div className="hidden xl:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm tabular-nums">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.1em]" style={{ backgroundColor: 'var(--color-cream)', color: 'var(--color-charcoal-light)' }}>
                <th className="text-left font-medium px-4 py-2">Line item</th>
                <th className="text-right font-medium px-2 py-2">Contract</th>
                <th className="text-right font-medium px-2 py-2">Change orders</th>
                <th className="text-right font-medium px-2 py-2">Current total</th>
                <th className="text-left font-medium px-2 py-2 w-[190px]">Completed to date</th>
                <th className="text-right font-medium px-2 py-2 w-[120px]">This invoice</th>
                <th className="text-right font-medium px-2 py-2 w-[110px]">Draw</th>
                <th className="text-right font-medium px-2 py-2">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ line, c }) => (
                <Row key={line.id} line={line} c={c} onAmount={onAmount} onEdit={onEdit} onBillRemaining={onBillRemaining} />
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-sm" style={{ color: 'var(--color-charcoal-light)' }}>
                    No line items match this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="border-t text-xs" style={{ borderColor: 'var(--color-stone)', backgroundColor: 'var(--color-cream)' }}>
                <td className="px-4 py-2 uppercase tracking-[0.1em]" style={{ color: 'var(--color-charcoal-light)' }}>
                  Project totals
                </td>
                <td className="px-2 py-2 text-right font-medium">{fmt(sumB)}</td>
                <td className="px-2 py-2 text-right font-medium">{s.sumCo ? money(s.sumCo, true) : '—'}</td>
                <td className="px-2 py-2 text-right font-medium">{fmt(s.contract)}</td>
                <td className="px-2 py-2 font-medium">
                  {fmt(s.performed)} <span style={{ color: 'var(--color-charcoal-light)' }}>performed</span>
                </td>
                <td className="px-2 py-2 text-right font-medium">{fmt(s.sumCp)}</td>
                <td className="px-2 py-2 text-right font-medium">{fmt(s.sumDraw)}</td>
                <td className="px-2 py-2 text-right font-medium">{fmt(s.remaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {parked.length ? (
          <details className="group border-t px-4 py-1" style={{ borderColor: 'var(--color-stone)' }}>
            {parkedHeading}
            <div className="overflow-x-auto pb-2">
              <table className="w-full min-w-[880px] text-sm tabular-nums">
                <tbody>
                  {parked.map(({ line, c }) => (
                    <Row key={line.id} line={line} c={c} onAmount={onAmount} onEdit={onEdit} onBillRemaining={onBillRemaining} />
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
        <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--color-stone)' }}>
          <button type="button" onClick={() => onEdit(null)} className="text-sm px-3.5 min-h-[40px] rounded-lg border" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}>
            + Add a line item
          </button>
        </div>
      </div>
    </section>
  )
}
