'use client'

// Progress billing on a job's schedule of values: each line's percent complete
// to date, what this period comes to, retainage, and a button that makes the
// draw a draft invoice (checked and sent from Billing like any other). The
// numbers here use the same math the server uses (lib/billing/progress.ts).

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/bot/ui'
import { formatValue } from '@/lib/analytics/format'
import { computeDraw, type ProgressLine } from '@/lib/billing/progress'

type State = { lines: ProgressLine[]; retainagePct: number; openDraft: { id: string; number: string } | null; draws: number; opening: Record<string, number> }

export default function ProgressBilling({ jobKey }: { jobKey: string }) {
  const router = useRouter()
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')
  const [pcts, setPcts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [openingMode, setOpeningMode] = useState(false)

  const load = async () => {
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobKey)}/progress`, { cache: 'no-store' })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return setError(json?.error ?? 'Could not load the schedule of values.')
    setState(json)
    setPcts({})
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobKey])

  const asked = useMemo(() => Object.fromEntries(Object.entries(pcts).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)])), [pcts])
  const draw = useMemo(() => (state ? computeDraw(state.lines, openingMode ? {} : asked, state.retainagePct) : null), [state, asked, openingMode])

  if (error) return <p className="rounded-2xl border border-dashed border-[var(--color-stone-mid)] p-4 text-sm text-[var(--color-charcoal-light)]">{error}</p>
  if (!state || !draw) return <p className="p-4 text-sm text-[var(--color-charcoal-light)]">Loading the schedule of values…</p>
  if (!state.lines.length) return <p className="rounded-2xl border border-dashed border-[var(--color-stone-mid)] p-4 text-sm text-[var(--color-charcoal-light)]">No schedule of values on this job. Award writes one from the accepted proposal.</p>

  const post = async (action: 'draw' | 'opening') => {
    setBusy(action)
    setError('')
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobKey)}/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, pcts: asked }) })
    const json = await res.json().catch(() => null)
    setBusy(null)
    if (!res.ok || !json?.ok) return setError(json?.error ?? 'Could not save.')
    if (action === 'draw') router.push(`/app/money/${json.documentId}`)
    else {
      setOpeningMode(false)
      await load()
    }
  }

  return (
    <section aria-label="Progress billing" className="rounded-2xl border border-[var(--color-stone)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">{openingMode ? 'Billed before the app' : 'Progress billing'}</p>
        <p className="text-xs text-[var(--color-charcoal-light)]">
          Billed to date {formatValue('money', draw.lines.reduce((a, l) => a + l.billedToDateCents, 0))} of {formatValue('money', draw.contractCents)}
          {state.retainagePct ? ` · ${state.retainagePct}% retainage` : ''}
        </p>
      </div>
      {state.openDraft ? (
        <p className="mb-3 rounded-lg bg-[rgba(212,175,55,0.16)] px-3 py-2 text-sm text-[#6b5212]">
          Draw {state.openDraft.number} is still a draft.{' '}
          <a className="underline" href={`/app/money/${state.openDraft.id}`}>
            Open it
          </a>{' '}
          to send or void before starting another.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-stone)] text-left text-[11px] uppercase tracking-[0.08em] text-[var(--color-charcoal-light)]">
              <th className="py-2 pr-3">Line</th>
              <th className="py-2 pr-3 text-right">Scheduled</th>
              <th className="py-2 pr-3 text-right">To date</th>
              <th className="py-2 pr-3 text-right">{openingMode ? 'Billed before the app' : '% complete'}</th>
              {!openingMode ? <th className="py-2 text-right">This period</th> : null}
            </tr>
          </thead>
          <tbody>
            {draw.lines.map((l) => (
              <tr key={l.key} className="border-b border-[var(--color-stone)] last:border-0">
                <td className="py-2 pr-3">
                  {l.description}
                  {l.kind === 'co' ? <span className="ml-1 text-[11px] text-[var(--color-charcoal-light)]">change order</span> : null}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatValue('money', l.scheduledCents)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {l.pctToDate}% · {formatValue('money', l.billedToDateCents)}
                </td>
                <td className="py-2 pr-3 text-right">
                  <label className="sr-only" htmlFor={`pct-${l.key}`}>
                    {l.description} percent complete
                  </label>
                  <input
                    id={`pct-${l.key}`}
                    inputMode="decimal"
                    placeholder={String(openingMode ? (state.opening[l.key] ?? 0) : l.pctToDate)}
                    value={pcts[l.key] ?? ''}
                    onChange={(e) => setPcts((p) => ({ ...p, [l.key]: e.target.value }))}
                    className="w-20 rounded-lg border border-[var(--color-stone-mid)] px-2 py-1 text-right text-base md:text-sm"
                  />
                  <span className="ml-1 text-xs">%</span>
                </td>
                {!openingMode ? <td className={`py-2 text-right tabular-nums ${l.thisPeriodCents ? 'font-semibold' : 'text-[var(--color-charcoal-light)]'}`}>{formatValue('money', l.thisPeriodCents)}</td> : null}
              </tr>
            ))}
          </tbody>
          {!openingMode ? (
            <tfoot className="text-sm">
              <tr>
                <td className="pt-3" colSpan={4}>
                  This period
                </td>
                <td className="pt-3 text-right font-semibold tabular-nums" data-draw="gross">
                  {formatValue('money', draw.grossCents)}
                </td>
              </tr>
              {draw.retainageCents ? (
                <tr>
                  <td colSpan={4}>Retainage held ({draw.retainagePct}%)</td>
                  <td className="text-right tabular-nums">−{formatValue('money', draw.retainageCents)}</td>
                </tr>
              ) : null}
              <tr>
                <td colSpan={4} className="font-medium">
                  Due on this draw
                </td>
                <td className="text-right text-base font-semibold tabular-nums" data-draw="due">
                  {formatValue('money', draw.dueCents)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {draw.errors.length && !openingMode ? <p className="mt-2 text-sm text-[#9a2a1f]">{draw.errors.join(' ')}</p> : null}
      {error ? <p className="mt-2 text-sm text-[#9a2a1f]">{error}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {openingMode ? (
          <>
            <Button variant="primary" busy={busy === 'opening'} onClick={() => post('opening')}>
              Save what was billed before
            </Button>
            <Button variant="quiet" onClick={() => setOpeningMode(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" busy={busy === 'draw'} disabled={!!state.openDraft || draw.errors.length > 0 || draw.grossCents <= 0} onClick={() => post('draw')}>
              Make the draft invoice
            </Button>
            {state.draws === 0 ? (
              <Button variant="quiet" onClick={() => (setOpeningMode(true), setPcts({}))}>
                Billed before the app?
              </Button>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
