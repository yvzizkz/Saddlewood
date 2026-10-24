'use client'

// The job's agreement, for the owners (T112): drafted from the accepted
// proposal and the job's contract figure, in contract.py's words filled from
// Company policies. Staff read the whole draft here first. A draft has no
// link a client can open, and nothing on this card sends anything.

import { useEffect, useState } from 'react'

import { Button, Card, Chip } from '@/components/bot/ui'
import { OpsMarkdown } from '@/components/ops/OpsMarkdown'
import { formatValue } from '@/lib/analytics/format'

type Agreement = {
  id: string
  number: string
  revision: number
  status: 'draft' | 'issued' | 'void'
  totalCents: number
  type: string | null
  text: string
  proposal: { number: string; revision: number; packageName: string; options: string[] } | null
  updatedAt: string
}
type State = { agreement: Agreement | null; blocked: string | null; types: Record<string, string> }

const STATUS: Record<Agreement['status'], { label: string; tone: 'quiet' | 'ok' | 'warn' }> = {
  draft: { label: 'Draft', tone: 'warn' },
  issued: { label: 'Issued', tone: 'ok' },
  void: { label: 'Void', tone: 'quiet' },
}

export default function AgreementCard({ jobKey }: { jobKey: string }) {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [type, setType] = useState('')
  const [clientName, setClientName] = useState('')
  const url = `/api/jobs/${encodeURIComponent(jobKey)}/agreement`

  const load = async () => {
    const res = await fetch(url, { cache: 'no-store' })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return setError(json?.error ?? 'Could not load the agreement.')
    setState(json)
    setType(json.agreement?.type ?? '')
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobKey])

  const draft = async () => {
    setBusy(true)
    setError('')
    const body: Record<string, string> = {}
    if (type) body.type = type
    if (clientName.trim()) body.clientName = clientName.trim()
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok || !json?.ok) return setError(json?.error ?? 'Could not draft the agreement.')
    await load()
  }

  const a = state?.agreement ?? null
  const live = a && a.status !== 'void' ? a : null
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Agreement</p>
        {a ? <Chip tone={STATUS[a.status].tone}>{`${STATUS[a.status].label} · ${a.number}${a.revision > 1 ? ` rev ${a.revision}` : ''}`}</Chip> : null}
      </div>
      {!state && !error ? <p className="text-sm text-[var(--color-charcoal-light)]">Loading the agreement…</p> : null}
      {state ? (
        <>
          {live ? (
            <p className="mb-2 text-xs text-[var(--color-charcoal-light)]" data-testid="agreement-source">
              {formatValue('money', live.totalCents)}, the job&apos;s contract.
              {live.proposal
                ? ` Scope from Proposal ${live.proposal.number}${live.proposal.revision > 1 ? ` rev ${live.proposal.revision}` : ''}${live.proposal.packageName ? ` (${live.proposal.packageName})` : ''}${live.proposal.options.length ? `, with ${live.proposal.options.join(', ')}` : ''}.`
                : ''}
              {live.status === 'draft' ? ' The client has no link to a draft.' : ''}
            </p>
          ) : (
            <p className="mb-2 text-sm text-[var(--color-charcoal-light)]">No agreement yet. It is drafted from the accepted proposal and the contract figure, in the words of the standard agreement.</p>
          )}
          {state.blocked ? <p className="mb-2 text-sm text-[var(--color-charcoal-light)]">{state.blocked}</p> : null}
          {!state.blocked && live?.status !== 'issued' ? (
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <label className="text-xs text-[var(--color-charcoal-light)]">
                Type
                <select className="mt-1 block rounded-lg border border-[var(--color-stone-mid)] bg-white px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">From the client</option>
                  {Object.entries(state.types).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[var(--color-charcoal-light)]">
                Signer&apos;s name
                <input className="mt-1 block rounded-lg border border-[var(--color-stone-mid)] bg-white px-2 py-1.5 text-sm" placeholder="The client's name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </label>
              <Button variant="primary" busy={busy} onClick={() => void draft()}>
                {live ? 'Draft it again' : 'Draft the agreement'}
              </Button>
            </div>
          ) : null}
          {live?.text ? (
            <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-[var(--color-stone-mid)] bg-white p-3 text-sm" data-testid="agreement-text">
              <OpsMarkdown>{live.text}</OpsMarkdown>
            </div>
          ) : null}
        </>
      ) : null}
      {error ? <p className="mt-2 text-sm text-[#9a2a1f]">{error}</p> : null}
    </Card>
  )
}
