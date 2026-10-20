'use client'

import { useEffect, useState } from 'react'

import { botApi } from '@/components/bot/BotProvider'
import { Button, Chip, Dot } from '@/components/bot/ui'
import { day, money } from '@/components/money/format'
import type { JobMoney } from '@/lib/billing/jobMoney'
import type { MaterialBlock as Material } from '@/lib/crew/purchases'
import MaterialBlock from './MaterialBlock'

// One job's money on the Projects screen (money.view): contract, billed, paid,
// owed and past due, read only, and the Material block (Home Depot, 0022).
// The numbers come from /api/crew/projects/money, which checks the switch and
// the job assignment and answers only for this job. Nothing here can change
// money. A field job with no billing job yet still gets its material.

export function JobMoneyFigures({ m }: { m: JobMoney }) {
  const late = m.open.filter((o) => (o.daysLate ?? 0) >= 1)
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-[var(--color-charcoal)]">Money</p>
        {m.pastDueCents > 0 ? (
          <Chip tone="bad">
            <Dot tone="bad" />
            {money(m.pastDueCents)} past due
          </Chip>
        ) : m.owedCents > 0 ? (
          <Chip tone="quiet">Nothing past due</Chip>
        ) : null}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
        {(
          [
            ['Contract', m.contractCents === null ? 'Not on file' : money(m.contractCents)],
            ['Billed', money(m.billedCents)],
            ['Paid', money(m.paidCents)],
            ['Owed', money(m.owedCents)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg bg-[var(--color-cream)] px-2 py-2">
            <dt className="text-[11px] text-[var(--color-charcoal-light)]">{label}</dt>
            <dd className="truncate text-[14px] font-semibold tabular-nums text-[var(--color-charcoal)]">{value}</dd>
          </div>
        ))}
      </dl>
      {late.length ? (
        <ul className="mt-2 space-y-1">
          {late.map((o) => (
            <li key={`${o.number}-${o.title}`} className="text-[13px] text-[var(--color-charcoal)]">
              <span className="font-medium">{o.number}</span> · {money(o.owedCents)} owed, {o.daysLate} day{o.daysLate === 1 ? '' : 's'} late
              {o.dueOn ? ` (due ${day(o.dueOn)})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {m.open.some((o) => o.payWhenPaid && o.daysLate === null) ? (
        <p className="mt-2 text-[12px] text-[var(--color-charcoal-light)]">
          Pay-when-paid: {m.open.filter((o) => o.payWhenPaid && o.daysLate === null).map((o) => `${o.number} ${money(o.owedCents)}`).join(', ')}. Not past due until a due date is set.
        </p>
      ) : null}
      {m.billedCents === 0 ? (
        <p className="mt-2 text-[12px] text-[var(--color-charcoal-light)]">Nothing billed from the app on this job yet.</p>
      ) : null}
    </>
  )
}

type Load = { state: 'loading' } | { state: 'error'; error: string } | { state: 'ok'; m: JobMoney | null; material: Material | null; crewJobId: string }

const NOT_LINKED = 'Money: no billing job linked yet. An owner links it on the Crew tab.'

export default function JobMoneyCard({ billingJobId, crewJobId = '', jobName = '' }: { billingJobId: string | null; crewJobId?: string; jobName?: string }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!billingJobId && !crewJobId) return
    let live = true
    const query = billingJobId ? `job=${encodeURIComponent(billingJobId)}` : `crewJob=${encodeURIComponent(crewJobId)}`
    botApi<{ ok: true; money: JobMoney | null; material: Material | null; crewJobId?: string | null }>(`/api/crew/projects/money?${query}`)
      // The field job behind a billing job comes back with the money (0026), so the Material block can search it.
      .then((d) => live && setLoad({ state: 'ok', m: d.money, material: d.material, crewJobId: d.crewJobId || crewJobId }))
      .catch((e: Error) => live && setLoad({ state: 'error', error: e.message }))
    return () => {
      live = false
    }
  }, [billingJobId, crewJobId, attempt])

  return (
    <div className="mt-3 border-t border-[var(--color-stone)] pt-3">
      {!billingJobId && !crewJobId ? (
        <p className="text-[12px] text-[var(--color-charcoal-light)]">{NOT_LINKED}</p>
      ) : load.state === 'loading' ? (
        <p className="text-[12px] text-[var(--color-charcoal-light)]">Money: loading…</p>
      ) : load.state === 'error' ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-[var(--color-charcoal-light)]">Money could not load ({load.error}).</p>
          <Button
            onClick={() => {
              setLoad({ state: 'loading' })
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          {load.m ? <JobMoneyFigures m={load.m} /> : <p className="text-[12px] text-[var(--color-charcoal-light)]">{NOT_LINKED}</p>}
          {load.material ? <MaterialBlock m={load.material} jobId={load.crewJobId} jobName={jobName} /> : null}
        </>
      )}
    </div>
  )
}
