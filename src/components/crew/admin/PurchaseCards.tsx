'use client'

import { useState } from 'react'

import { Button, Card, INPUT, SectionTitle } from '@/components/bot/ui'
import { money } from '@/components/money/format'
import type { UnmatchedPurchase } from '@/lib/crew/purchases'
import { dayShort } from '@/lib/crew/time'
import { useCrewAdmin } from './useCrewAdmin'

// "Which job is this?" (0022): Home Depot register names with lines on no job
// yet, on the Today view for anyone who sees money. One tap: pick the job and
// the name is remembered and every line typed under it is filed; an owner can
// set a name aside instead (a quote, a personal purchase). The server checks
// the switch and, for a project manager, that the job is one of theirs; the
// jobs offered here are already the ones the viewer sees.

export function UnmatchedPurchases() {
  const { data, run, isOwner } = useCrewAdmin()
  const [busy, setBusy] = useState<string | null>(null)
  const names = data?.unmatchedPurchases ?? []
  const older = data?.olderPurchaseNames ?? 0
  if (!data || (!names.length && !older)) return null
  const jobs = data.jobs.filter((j) => j.active)
  // The history from before the app (0026): one line, not a thousand cards; search on Money finds any of them.
  const olderLine = older ? (
    <p className="mt-2 text-[12px] text-[var(--color-charcoal-light)]">
      {older.toLocaleString('en-US')} older name{older === 1 ? '' : 's'} from before the app; find them with search.
    </p>
  ) : null
  if (!names.length) {
    return (
      <>
        <SectionTitle>Which job is this?</SectionTitle>
        {olderLine}
      </>
    )
  }

  async function answer(p: UnmatchedPurchase, jobId: string | null) {
    setBusy(p.key)
    await run({ kind: 'purchase.assign', alias: p.key, jobId })
    setBusy(null)
  }

  return (
    <>
      <SectionTitle count={names.length}>Which job is this?</SectionTitle>
      <Card className="divide-y divide-[var(--color-stone)]">
        {names.map((p) => {
          const filing = busy === p.key
          return (
            <div key={p.key} className="px-4 py-3">
              <p className="text-[15px] leading-snug text-[var(--color-charcoal)]">
                Home Depot, typed as <span className="font-medium">&lsquo;{p.name || p.key}&rsquo;</span>
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--color-charcoal-light)]">
                {p.trips} trip{p.trips === 1 ? '' : 's'} · {money(p.cents)} · last {dayShort(p.lastOn)}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <select
                  className={INPUT}
                  value=""
                  disabled={filing}
                  aria-label={`Which job is ${p.name || p.key}?`}
                  onChange={(e) => {
                    if (e.target.value) void answer(p, e.target.value)
                  }}
                >
                  <option value="">{filing ? 'Filing…' : 'Pick the job'}</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </select>
                {isOwner ? (
                  <Button disabled={filing} onClick={() => void answer(p, null)}>
                    Ignore
                  </Button>
                ) : null}
              </div>
            </div>
          )
        })}
      </Card>
      {olderLine}
    </>
  )
}
