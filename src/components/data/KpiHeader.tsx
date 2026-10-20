'use client'

// The top of every Accounting section: the one number that matters, how it
// moved against the period before, a few supporting figures, the trend, and
// the breakdown (by trade, job, person, vendor…). Tapping a bar narrows the
// whole page to it (drill.ts builds those links on the server).

import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import { formatValue, type ValueKind } from '@/lib/analytics/format'
import { BreakdownBars, CompositionStrip, TrendChart, type ChartPoint, type ChartSlice } from './charts'

export type KpiStat = { label: string; value: number | string | null; kind: ValueKind; hint?: string; href?: string }

export type KpiHeaderProps = {
  label: string
  value: number
  kind: ValueKind
  change: { pct: number; up: boolean } | null
  /** Whether a rise is good news (cash in) or not (cost). Colors the delta. */
  upIsGood?: boolean
  compareLabel?: string
  stats?: KpiStat[]
  trend: ChartPoint[]
  trendLabel?: string
  breakdown: { dim: { key: string; label: string; plural: string }; slices: ChartSlice[] }
  byOptions: { key: string; label: string; href: string; active: boolean }[]
}

function Delta({ change, upIsGood, compareLabel }: { change: KpiHeaderProps['change']; upIsGood: boolean; compareLabel?: string }) {
  if (!change) return <span className="text-xs text-[var(--color-charcoal-light)]">{compareLabel ? `nothing to compare with ${compareLabel}` : ''}</span>
  const good = change.up === upIsGood
  const pct = Math.abs(change.pct)
  const Icon = change.up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums"
        style={{ color: good ? '#2f6b4a' : '#9a2a1f', backgroundColor: good ? 'rgba(47,107,74,0.10)' : 'rgba(154,42,31,0.08)' }}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {pct >= 10 ? `${Math.round(pct)}×` : `${Math.round(pct * 100)}%`}
      </span>
      {compareLabel ? <span className="text-[var(--color-charcoal-light)]">vs {compareLabel}</span> : null}
    </span>
  )
}

export default function KpiHeader(p: KpiHeaderProps) {
  const slices = p.breakdown.slices
  return (
    <section aria-label={p.label} className="rounded-2xl border border-[var(--color-stone)] bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-xs font-medium text-[var(--color-charcoal-light)]">{p.label}</p>
          <p className="mt-0.5 text-[40px] font-semibold leading-none tracking-tight text-[var(--color-charcoal)] md:text-5xl">{formatValue(p.kind, p.value)}</p>
          <div className="mt-2">
            <Delta change={p.change} upIsGood={p.upIsGood ?? true} compareLabel={p.compareLabel} />
          </div>
        </div>
        {p.stats?.length ? (
          <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 md:max-w-xl">
            {p.stats.map((s) => {
              const v = typeof s.value === 'string' ? s.value : formatValue(s.kind, s.value)
              const inner = (
                <>
                  <dt className="text-[11px] text-[var(--color-charcoal-light)]">{s.label}</dt>
                  <dd className="text-lg font-semibold text-[var(--color-charcoal)]">{v}</dd>
                  {s.hint ? <dd className="text-[11px] text-[var(--color-charcoal-light)]">{s.hint}</dd> : null}
                </>
              )
              return s.href ? (
                <Link key={s.label} href={s.href} className="rounded-lg hover:bg-[var(--color-cream)] -m-1 p-1">
                  {inner}
                </Link>
              ) : (
                <div key={s.label}>{inner}</div>
              )
            })}
          </dl>
        ) : null}
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-5">
        <div className="md:col-span-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">{p.trendLabel ?? 'Trend'}</p>
          <TrendChart points={p.trend} kind={p.kind} label={p.trendLabel ?? p.label} />
        </div>
        <div className="md:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">By {p.breakdown.dim.label.toLowerCase()}</p>
            {p.byOptions.length > 1 ? (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Group by">
                {p.byOptions.map((o) => (
                  <Link
                    key={o.key}
                    href={o.href}
                    scroll={false}
                    aria-current={o.active ? 'true' : undefined}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      o.active ? 'bg-[var(--color-teal)] text-white' : 'bg-[var(--color-cream)] text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]'
                    }`}
                  >
                    {o.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mb-4">
            <CompositionStrip slices={slices} kind={p.kind} />
          </div>
          <BreakdownBars slices={slices} kind={p.kind} noun={p.breakdown.dim.label.toLowerCase()} />
        </div>
      </div>
    </section>
  )
}
