'use client'

// Today · Week · Month · Year · Custom. The choice lives in the URL (?p=, and
// from/to for a custom range), so every chart, number and table on the page
// re-reads the same slice, and a link opens the screen as it was seen.
// Picking a period keeps the drill-down (?trade=…) and the grouping (?by=…).

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CalendarRange, Loader2 } from 'lucide-react'

import { PERIOD_KEYS, PERIOD_LABEL, type PeriodKey } from '@/lib/analytics/period'

export default function PeriodPicker({
  period,
  compareLabel,
}: {
  period: { key: PeriodKey; from: string; to: string; label: string }
  compareLabel?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const [pending, start] = useTransition()
  const [custom, setCustom] = useState(period.key === 'custom')
  const [from, setFrom] = useState(period.from)
  const [to, setTo] = useState(period.to)

  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(search.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k)
      else q.set(k, v)
    }
    start(() => router.push(`${pathname}?${q.toString()}`, { scroll: false }))
  }

  const pick = (k: PeriodKey) => {
    if (k === 'custom') {
      setCustom(true)
      return
    }
    setCustom(false)
    go({ p: k, from: null, to: null })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Period" className="flex flex-1 rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)] p-1 md:flex-none">
          {PERIOD_KEYS.map((k) => {
            const active = custom ? k === 'custom' : period.key === k
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => pick(k)}
                className={`min-h-9 flex-1 rounded-lg px-3 text-[13px] font-medium transition-colors md:flex-none ${
                  active ? 'bg-white text-[var(--color-charcoal)] shadow-sm' : 'text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]'
                }`}
              >
                {k === 'custom' ? <CalendarRange className="mx-auto size-4" aria-label="Custom range" /> : PERIOD_LABEL[k]}
              </button>
            )
          })}
        </div>
        {pending ? <Loader2 className="size-4 animate-spin text-[var(--color-charcoal-light)]" aria-label="Loading" /> : null}
      </div>
      {custom ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (from && to) go({ p: 'custom', from, to })
          }}
        >
          <label className="text-xs text-[var(--color-charcoal-light)]">
            From
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-[var(--color-stone-mid)] bg-white px-2 py-1.5 text-base text-[var(--color-charcoal)]" />
          </label>
          <label className="text-xs text-[var(--color-charcoal-light)]">
            To
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-[var(--color-stone-mid)] bg-white px-2 py-1.5 text-base text-[var(--color-charcoal)]" />
          </label>
          <button type="submit" className="min-h-10 rounded-lg bg-[var(--color-teal)] px-4 text-sm font-medium text-white">
            Show
          </button>
        </form>
      ) : null}
      <p className="text-xs text-[var(--color-charcoal-light)]">
        {period.label}
        {compareLabel ? <span> · compared with {compareLabel}</span> : null}
      </p>
    </div>
  )
}
