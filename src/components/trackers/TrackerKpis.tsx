'use client'

import { money, pctStr, type LineCalc, type TrackerSummary } from '@/lib/trackers/core'
import { fmt } from './format'

type Props = { s: TrackerSummary; calcs: LineCalc[]; paymentsCount: number }

function Tile({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3 min-w-0" style={{ borderColor: 'var(--color-stone)' }}>
      <div className="text-[10px] tracking-[0.14em] uppercase mb-1.5" style={{ color: 'var(--color-charcoal-light)' }}>
        {label}
      </div>
      <div className="text-xl md:text-2xl text-[var(--color-charcoal)] tabular-nums leading-tight whitespace-nowrap" style={{ fontFamily: 'var(--font-fraunces)' }}>
        {value}
      </div>
      {sub ? (
        <div className="text-xs mt-1" style={{ color: 'var(--color-charcoal-light)' }}>
          {sub}
        </div>
      ) : null}
      {children}
    </div>
  )
}

/** The summary the workbook's Financial Summary block carries, at a glance. */
export function TrackerKpis({ s, calcs, paymentsCount }: Props) {
  const priorPct = s.contract ? Math.min(1, Math.max(0, (s.performed - s.sumCp) / s.contract)) : 0
  const curPct = s.contract ? s.sumCp / s.contract : 0
  const drawPct = s.contract ? s.sumDraw / s.contract : 0
  const carry = s.totalDue - s.sumG
  const heroSub =
    s.sumG > 0
      ? `Work billed ${fmt(s.sumCp)}${s.sumDraw > 0.005 ? ` · advance draws ${fmt(s.sumDraw)}` : ''}${Math.abs(carry) > 0.005 ? ` · prior balance ${fmt(carry)}` : ''}`
      : Math.abs(carry) > 0.005
        ? `Prior balance carried ${fmt(carry)}`
        : 'Nothing billed yet — tap a line below to bill it'
  void calcs
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="col-span-2 md:col-span-4 rounded-lg px-5 py-4" style={{ backgroundColor: 'var(--color-teal)', color: 'var(--color-cream)' }}>
        <div className="text-[10px] tracking-[0.14em] uppercase mb-1.5" style={{ color: 'var(--color-gold)' }}>
          Total due this invoice
        </div>
        <div className="text-4xl md:text-5xl tabular-nums leading-none" style={{ fontFamily: 'var(--font-fraunces)' }}>
          {fmt(s.totalDue)}
        </div>
        <div className="text-xs mt-2" style={{ color: 'rgba(245,240,232,0.75)' }}>
          {heroSub}
        </div>
      </div>
      <Tile label="Contract value" value={fmt(s.contract)} sub={`incl. change orders ${money(s.sumCo, true)}`} />
      <Tile label="Performed to date" value={fmt(s.performed)} sub={`${pctStr(s.pct)} of contract`}>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--color-stone)' }} aria-hidden="true">
          <i className="block h-full" style={{ width: `${(priorPct * 100).toFixed(2)}%`, backgroundColor: '#2f6b4a' }} />
          <i className="block h-full" style={{ width: `${(curPct * 100).toFixed(2)}%`, backgroundColor: 'var(--color-gold)' }} />
          <i className="block h-full" style={{ width: `${(drawPct * 100).toFixed(2)}%`, backgroundImage: 'repeating-linear-gradient(45deg, var(--color-gold) 0 3px, transparent 3px 6px)' }} />
        </div>
      </Tile>
      <Tile label="Paid to date" value={fmt(s.paid)} sub={`${paymentsCount} payments`} />
      <Tile label="Remaining to bill" value={fmt(s.remaining)} sub="work not yet performed" />
    </div>
  )
}
