'use client'

import { useEffect, useRef, useState } from 'react'
import { Briefcase } from 'lucide-react'

import { botApi } from '@/components/bot/BotProvider'
import { Button, Chip, Field, INPUT } from '@/components/bot/ui'
import { PhasePick } from '@/components/crew/PhasePick'
import { BottomSheet } from '@/components/ui/BottomSheet'
import type { AwardChoices, AwardPlan } from '@/lib/sales/award'
import { usd } from '../format'

// Award: what will be built from the accepted proposal, with the few things an
// owner may change, then one tap builds it (KB docs/JOB-LIFECYCLE-PLAN §6).
// Every change asks the server for the plan again, so what is shown is what
// will be made.

type Preview = {
  proposal: { documentId: string; number: string; revision: number; packages: { id: string; name: string; totalCents: number }[] } | null
  accepted: { packageName: string; totalCents: number; name: string; at: string } | null
  choices: AwardChoices
  plan: AwardPlan
  people: { email: string; name: string; group: string }[]
  existing: { clientId: string | null; jobId: string | null; crewJobId: string | null; awarded: boolean }
  conflict: string
  prefixUsedBy: string[]
}

function query(c: Partial<AwardChoices>): string {
  const q = new URLSearchParams()
  if (c.jobName !== undefined) q.set('jobName', c.jobName)
  if (c.prefix !== undefined) q.set('prefix', c.prefix)
  if (c.template) q.set('template', c.template)
  if (c.pmEmail !== undefined) q.set('pmEmail', c.pmEmail)
  if (c.packageId) q.set('packageId', c.packageId)
  if (c.deposit !== undefined) q.set('deposit', c.deposit ? '1' : '0')
  if (c.contractCents !== undefined) q.set('contractCents', c.contractCents === null ? '' : String(c.contractCents))
  return q.toString()
}

function Row({ label, value, tag }: { label: string; value: string; tag?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-[var(--color-charcoal-light)]">{label}</span>
      <span className="text-right text-[var(--color-charcoal)]">
        {value}
        {tag ? <span className="ml-1.5 align-middle"><Chip tone="quiet">{tag}</Chip></span> : null}
      </span>
    </div>
  )
}

export function AwardSheet({ opportunityId, open, onClose, onDone, toast }: { opportunityId: string; open: boolean; onClose: () => void; onDone: () => void; toast: (m: string, t?: 'ok' | 'bad') => void }) {
  const [p, setP] = useState<Preview | null>(null)
  const [c, setC] = useState<Partial<AwardChoices>>({})
  const [contract, setContract] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    const n = ++seq.current
    const t = setTimeout(async () => {
      try {
        const r = await botApi<Preview>(`/api/sales/${opportunityId}/award?${query(c)}`)
        if (n !== seq.current) return
        setP(r)
        setError('')
      } catch (e) {
        if (n === seq.current) setError((e as Error).message)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [open, opportunityId, c])

  useEffect(() => {
    if (!open) {
      setC({})
      setContract('')
      setP(null)
      setError('')
    }
  }, [open])

  const choices = p ? { ...p.choices, ...c } : null
  const set = (patch: Partial<AwardChoices>) => setC((x) => ({ ...x, ...patch }))

  async function award() {
    if (!choices) return
    setBusy(true)
    try {
      const r = await botApi<{ depositId: string | null; placed: boolean }>(`/api/sales/${opportunityId}/award`, { method: 'POST', body: JSON.stringify(choices) })
      toast(r.depositId ? 'Awarded. The deposit invoice is a draft in Money.' : 'Awarded', 'ok')
      onDone()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const plan = p?.plan
  return (
    <BottomSheet isOpen={open} onClose={onClose} title="Award the job" maxHeightDvh={92}>
      <div className="space-y-4 px-5 pb-6 pt-4">
        {error && !p ? <p className="text-sm text-[#9a2a1f]">{error}</p> : null}
        {!p || !plan || !choices ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading">
            <div className="h-12 animate-pulse rounded-xl bg-[var(--color-cream)]" />
            <div className="h-32 animate-pulse rounded-xl bg-[var(--color-cream)]" />
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--color-charcoal)]">
              {p.accepted
                ? `${p.accepted.name} accepted ${p.accepted.packageName ? `${p.accepted.packageName}, ` : ''}${usd(p.accepted.totalCents)}.`
                : p.proposal
                  ? `Won on other paper, not accepted on the link.${p.proposal.packages.length > 1 ? ' Pick the package it was won on.' : ''}`
                  : 'Won without a proposal from the app. Enter the contract amount.'}
            </p>

            <Field label="Job name" hint="The street address (SOP-003). Receipts, hours and invoices are filed under it.">
              <input className={INPUT} value={choices.jobName} onChange={(e) => set({ jobName: e.target.value })} />
            </Field>

            {!p.accepted && p.proposal && p.proposal.packages.length > 1 ? (
              <Field label="Package">
                <select className={INPUT} value={choices.packageId} onChange={(e) => set({ packageId: e.target.value })}>
                  {p.proposal.packages.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}: {usd(x.totalCents)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field
              label="Contract amount"
              hint={
                p.accepted || p.proposal
                  ? `Leave empty to keep ${p.accepted ? 'the accepted total' : "the proposal's total"}. Enter one only when the signed paper says otherwise (a GC subcontract).`
                  : 'What the signed paper says.'
              }
            >
              <input
                className={INPUT}
                inputMode="decimal"
                placeholder={usd(plan.job.contractCents)}
                value={contract}
                onChange={(e) => {
                  setContract(e.target.value)
                  const n = Number(e.target.value.replace(/[$,\s]/g, ''))
                  set({ contractCents: e.target.value.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null })
                }}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Number prefix" hint={p.prefixUsedBy.length ? `Also used by ${p.prefixUsedBy.join(', ')}. Money matches bills to jobs by it; add a letter (${choices.prefix}B) to keep them apart.` : 'Invoices are numbered from it.'}>
                <input className={INPUT} value={choices.prefix} placeholder="7120" onChange={(e) => set({ prefix: e.target.value })} />
              </Field>
              <Field label="Project manager">
                <select className={INPUT} value={choices.pmEmail} onChange={(e) => set({ pmEmail: e.target.value })}>
                  <option value="">Nobody yet</option>
                  {p.people.map((x) => (
                    <option key={x.email} value={x.email}>
                      {x.name}
                      {x.group ? ` (${x.group})` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">Phases to start from</p>
              <PhasePick value={choices.template} onChange={(v) => set({ template: v })} allowNone />
              <p className="mt-1 text-[11px] text-[var(--color-charcoal-light)]">Whole job for a remodel, addition or custom home; or pick the trades we perform on it.</p>
            </div>

            <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--color-stone)] bg-white px-3">
              <span className="text-sm text-[var(--color-charcoal)]">Draft the deposit invoice</span>
              <input type="checkbox" className="size-5 accent-[var(--color-teal)]" checked={choices.deposit} onChange={(e) => set({ deposit: e.target.checked })} />
            </label>

            <div className="rounded-2xl border border-[var(--color-stone)] bg-[var(--color-cream)] px-4 py-3">
              <p className="mb-1 text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--color-gold-accessible)]">What this builds</p>
              <Row label="Client" value={plan.client.name} tag={p.existing.clientId ? 'on file' : 'new'} />
              <Row label="Billing job" value={plan.job.name} tag={p.existing.jobId ? 'on file' : 'new'} />
              <Row label="Field job" value={plan.crew.name} tag={p.existing.crewJobId ? 'on the list' : 'new'} />
              <Row label="Contract" value={usd(plan.job.contractCents)} />
              <div className="my-1 border-t border-[var(--color-stone)] pt-1">
                <p className="pt-1 text-xs font-medium text-[var(--color-charcoal)]">Schedule of values</p>
                {plan.job.sov.map((l, i) => (
                  <div key={i} className="flex justify-between gap-3 py-0.5 text-[13px] text-[var(--color-charcoal)]">
                    <span>{l.description}</span>
                    <span className="font-mono">{usd(l.amountCents)}</span>
                  </div>
                ))}
              </div>
              {plan.deposit ? <Row label={`Deposit invoice ${plan.deposit.number}`} value={`${usd(plan.deposit.totalCents)} draft`} /> : null}
              {choices.deposit && !plan.deposit ? <p className="py-1 text-xs text-[#9a2a1f]">The deposit needs a number prefix.</p> : null}
              <div className="mt-1 border-t border-[var(--color-stone)] pt-2">
                <p className="text-xs font-medium text-[var(--color-charcoal)]">Paperwork to watch</p>
                <ul className="mt-1 space-y-1">
                  {plan.watches.map((w) => (
                    <li key={w.kind} className="text-[13px] text-[var(--color-charcoal)]">
                      {w.title}
                      {w.dueOn ? <span className="text-[var(--color-charcoal-light)]"> · by {w.dueOn.slice(5).replace('-', '/')}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {p.existing.awarded ? <p className="text-sm text-[#9a2a1f]">This job was already awarded.</p> : null}
            {p.conflict ? <p className="text-sm text-[#9a2a1f]">{p.conflict}</p> : null}
            {error ? <p className="text-sm text-[#9a2a1f]">{error}</p> : null}
            <Button variant="primary" full busy={busy} disabled={p.existing.awarded || !!p.conflict || !choices.jobName.trim()} onClick={award}>
              <Briefcase className="size-4" aria-hidden="true" /> Award the job
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
