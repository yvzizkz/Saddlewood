'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, HardHat, Plus } from 'lucide-react'

import { botApi } from '@/components/bot/BotProvider'
import { Button, Card, Chip, INPUT } from '@/components/bot/ui'
import { watchDue, type JobWatch } from '@/lib/sales/award'
import type { AwardedJob } from '@/lib/sales/awardStore'
import { NewPackageSheet } from '@/components/subs/NewPackageSheet'
import { shortDay, usd } from '../format'

// The job a won opportunity became: the contract, links to its money and its
// field side, and the paperwork it owes, each done with a tap (who and when kept).

export function JobPaperwork({ opportunityId, job, today, canEdit, onChange, toast }: {
  opportunityId: string
  job: AwardedJob
  today: string
  canEdit: boolean
  onChange: () => void
  toast: (m: string, t?: 'ok' | 'bad') => void
}) {
  const [busy, setBusy] = useState<number | 'add' | null>(null)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [bidOut, setBidOut] = useState(false)

  async function post(body: unknown, key: number | 'add') {
    setBusy(key)
    try {
      await botApi(`/api/sales/${opportunityId}/watches`, { method: 'POST', body: JSON.stringify(body) })
      onChange()
      return true
    } catch (e) {
      toast((e as Error).message, 'bad')
      return false
    } finally {
      setBusy(null)
    }
  }

  const sorted = [...job.watches].sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt))
  const dueOf = (w: JobWatch) => watchDue(w, job.firstDay)

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-[var(--color-charcoal)]">{job.name}</p>
        {job.contractCents !== null ? <span className="font-mono text-sm text-[var(--color-charcoal)]">{usd(job.contractCents)}</span> : null}
      </div>
      {job.award ? (
        <p className="mt-0.5 text-xs text-[var(--color-charcoal-light)]">
          Awarded {shortDay(job.award.awardedAt)} by {job.award.awardedBy}
          {job.award.packageName ? ` · ${job.award.packageName}` : ''}
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-[var(--color-charcoal-light)]">Opened before Award existed. Award it to set the contract and paperwork.</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {job.depositId ? (
          <Link href={`/app/money/${job.depositId}`} className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--color-stone)] bg-white px-3 text-sm text-[var(--color-teal)]">
            Deposit invoice <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
        {job.crewJobId ? (
          <Link href="/app/crew?view=jobs" className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--color-stone)] bg-white px-3 text-sm text-[var(--color-teal)]">
            Field job <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
        {canEdit ? (
          <button type="button" onClick={() => setBidOut(true)} className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--color-stone)] bg-white px-3 text-sm text-[var(--color-teal)]">
            Get sub bids <HardHat className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {canEdit ? <NewPackageSheet open={bidOut} onClose={() => setBidOut(false)} target={{ jobId: job.jobId, opportunityId, name: job.name }} toast={toast} /> : null}

      {job.watches.length || canEdit ? (
        <div className="mt-3 border-t border-[var(--color-stone)] pt-3">
          <p className="mb-1 text-xs font-medium text-[var(--color-charcoal)]">Paperwork</p>
          <ul className="divide-y divide-[var(--color-stone)]">
            {sorted.map((w) => {
              const d = dueOf(w)
              const late = !w.doneAt && d && d < today
              return (
                <li key={w.id} className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    disabled={!canEdit || busy === w.id}
                    onClick={() => post({ id: w.id, done: !w.doneAt }, w.id)}
                    aria-label={w.doneAt ? `Open ${w.title} again` : `Mark ${w.title} done`}
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full border ${w.doneAt ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] bg-white'}`}
                  >
                    {w.doneAt ? <Check className="size-4" aria-hidden="true" /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${w.doneAt ? 'text-[var(--color-charcoal-light)] line-through' : 'text-[var(--color-charcoal)]'}`}>{w.title}</p>
                    <p className="text-[11px] text-[var(--color-charcoal-light)]">
                      {w.doneAt
                        ? `Done ${shortDay(w.doneAt)}${w.doneBy ? ` by ${w.doneBy}` : ''}`
                        : d
                          ? `${late ? 'Was due' : 'Due'} ${shortDay(d)}`
                          : w.kind === 'prelim_notice'
                            ? 'Due 20 days after the first day of work'
                            : 'No date'}
                    </p>
                  </div>
                  {late ? <Chip tone="bad">Late</Chip> : null}
                </li>
              )
            })}
          </ul>
          {canEdit ? (
            adding ? (
              <div className="mt-2 space-y-2">
                <input className={INPUT} placeholder="Building permit pulled" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="What to watch" />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input className={INPUT} type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due" />
                  <Button
                    variant="primary"
                    busy={busy === 'add'}
                    disabled={title.trim().length < 2}
                    onClick={async () => {
                      const kind = /permit/i.test(title) ? 'permit' : 'custom'
                      if (await post({ add: { kind, title: title.trim(), dueOn: due || null } }, 'add')) {
                        setTitle('')
                        setDue('')
                        setAdding(false)
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="quiet" className="mt-1 !px-0" onClick={() => setAdding(true)}>
                <Plus className="size-4" aria-hidden="true" /> Something else to watch
              </Button>
            )
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
