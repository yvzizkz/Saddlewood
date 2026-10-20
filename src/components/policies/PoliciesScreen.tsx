'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Clock, Lock, RotateCcw } from 'lucide-react'

import { Button, Card, Chip, INPUT, ScreenTitle } from '@/components/bot/ui'
import { NumberField, Pill, Toggle } from '@/components/sales/builder/fields'
import { useSalesToast } from '@/components/sales/useSalesToast'
import { stamp } from '@/components/sales/format'
import { planDueLabel } from '@/lib/crew/settingsRules'
import { DECISIONS, policyMoney, type DecisionDef, type PolicyDef, type Policies } from '@/lib/policies/rules'

// The owners' decisions for running a job after it is won: each with what we
// recommend and why, the setting itself, whether the app already uses it, and
// where the company's own documents disagreed. Switches and choices save on
// tap; amounts save with their Save button. Office staff can read, not change.

type Loaded = { values: Policies; changed: Record<string, { by: string; at: string }>; canEdit: boolean }

function same(a: unknown, b: unknown): boolean {
  return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b
}

function shown(def: PolicyDef, v: unknown): string {
  const c = def.control
  if (c.type === 'toggle') return v ? 'On' : 'Off'
  if (c.type === 'money') return policyMoney(Number(v))
  if (c.type === 'percent') return `${v}%`
  if (c.type === 'days') return `${v} days`
  if (c.type === 'years') return `${v} ${Number(v) === 1 ? 'year' : 'years'}`
  if (c.type === 'count') return `${v} ${c.unit}`
  if (c.type === 'time') return planDueLabel(String(v))
  return c.options.find((o) => o.value === v)?.label ?? String(v)
}

function TimeControl({ def, value, canEdit, busy, onSave }: { def: PolicyDef; value: string; canEdit: boolean; busy: boolean; onSave: (v: unknown) => Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(null)
  const now = draft ?? value
  return (
    <div className="py-2">
      <p className="mb-1.5 text-sm text-[var(--color-charcoal)]">{def.label}</p>
      <div className="flex gap-2">
        <input className={`${INPUT} min-w-0 flex-1`} type="time" step={900} aria-label={def.label} value={now} disabled={!canEdit} onChange={(e) => setDraft(e.target.value)} />
        {canEdit ? (
          <Button variant="primary" busy={busy} disabled={draft === null || draft === value || !/^\d{2}:\d{2}$/.test(draft)} onClick={() => void onSave(draft).then(() => setDraft(null))}>
            Save
          </Button>
        ) : null}
      </div>
      {def.hint ? <p className="mt-1 text-xs text-[var(--color-charcoal-light)]">{def.hint}</p> : null}
    </div>
  )
}

function Control({ def, value, canEdit, onSave }: { def: PolicyDef; value: unknown; canEdit: boolean; onSave: (v: unknown) => Promise<void> }) {
  const c = def.control
  const [draft, setDraft] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (v: unknown) => {
    setBusy(true)
    try {
      await onSave(v)
      setDraft(null)
    } finally {
      setBusy(false)
    }
  }

  if (c.type === 'toggle') {
    return <Toggle on={!!value} onChange={(v) => canEdit && !busy && void save(v)} label={def.label} hint={def.hint} />
  }
  if (c.type === 'choice') {
    return (
      <div className="py-2">
        <p className="mb-1.5 text-sm text-[var(--color-charcoal)]">{def.label}</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={def.label}>
          {c.options.map((o) => (
            <Pill key={o.value} on={value === o.value} onClick={() => canEdit && !busy && value !== o.value && void save(o.value)}>
              {o.label}
            </Pill>
          ))}
        </div>
        {def.hint ? <p className="mt-1 text-xs text-[var(--color-charcoal-light)]">{def.hint}</p> : null}
      </div>
    )
  }
  if (c.type === 'time') return <TimeControl def={def} value={String(value)} canEdit={canEdit} busy={busy} onSave={save} />
  // Numbers: dollars, percent, days, years.
  const isMoney = c.type === 'money'
  const current = isMoney ? Number(value) / 100 : Number(value)
  const now = draft ?? current
  const changed = draft !== null && !same(draft, current)
  return (
    <div className="py-2">
      <p className="mb-1.5 text-sm text-[var(--color-charcoal)]">{def.label}</p>
      <div className="flex gap-2">
        <NumberField
          label={def.label}
          value={now}
          prefix={isMoney ? '$' : undefined}
          suffix={c.type === 'percent' ? '%' : c.type === 'days' ? 'days' : c.type === 'years' ? 'years' : c.type === 'count' ? c.unit : undefined}
          max={isMoney ? 1_000_000 : c.max}
          onChange={(n) => canEdit && setDraft(n)}
          className="min-w-0 flex-1"
        />
        {canEdit ? (
          <Button variant="primary" busy={busy} disabled={!changed} onClick={() => void save(isMoney ? Math.round(now * 100) : c.type === 'percent' ? now : Math.round(now))}>
            Save
          </Button>
        ) : null}
      </div>
      {def.hint ? <p className="mt-1 text-xs text-[var(--color-charcoal-light)]">{def.hint}</p> : null}
    </div>
  )
}

function DecisionCard({ d, data, onSave }: { d: DecisionDef; data: Loaded; onSave: (key: string, v: unknown) => Promise<void> }) {
  const off = d.policies.filter((p) => !same(data.values[p.key], p.recommended))
  const last = d.policies
    .map((p) => data.changed[p.key])
    .filter(Boolean)
    .sort((a, b) => b.at.localeCompare(a.at))[0]
  return (
    <Card className="overflow-hidden" >
      <div id={d.id} className="scroll-mt-20 px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] font-mono text-[var(--color-gold-accessible)]">{d.title}</p>
          {off.length ? <Chip tone="warn">Changed</Chip> : <Chip tone="ok">Recommended</Chip>}
        </div>
        <p className="mt-1.5 text-[15px] font-medium text-[var(--color-charcoal)]">{d.question}</p>
        <div className="mt-3 rounded-xl bg-[var(--color-cream)] px-3 py-2.5">
          <p className="text-sm text-[var(--color-charcoal)]">
            <span className="font-medium">We recommend:</span> {d.recommendation}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-charcoal-light)]">{d.why}</p>
        </div>
      </div>
      <div className="divide-y divide-[var(--color-stone)] border-t border-[var(--color-stone)] px-4">
        {d.policies.filter((p) => !p.showIf || data.values[p.showIf.key] === p.showIf.equals).map((p) => (
          <div key={p.key}>
            <Control def={p} value={data.values[p.key]} canEdit={data.canEdit} onSave={(v) => onSave(p.key, v)} />
            {!same(data.values[p.key], p.recommended) ? (
              <div className="flex items-center justify-between gap-2 pb-2 text-xs text-[var(--color-charcoal-light)]">
                <span>Recommended: {shown(p, p.recommended)}</span>
                {data.canEdit ? (
                  <button type="button" onClick={() => void onSave(p.key, p.recommended)} className="inline-flex min-h-9 items-center gap-1 font-medium text-[var(--color-teal)]">
                    <RotateCcw className="size-3.5" aria-hidden="true" /> Use it
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="space-y-1.5 border-t border-[var(--color-stone)] bg-[var(--color-background)]/50 px-4 py-3 text-xs">
        {d.liveIn ? (
          <p className="flex items-start gap-1.5 text-[#2f6b4a]">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> <span>In use now: {d.liveIn}</span>
          </p>
        ) : null}
        {d.laterIn ? (
          <p className="flex items-start gap-1.5 text-[var(--color-charcoal-light)]">
            <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> <span>{d.liveIn ? 'Also used' : 'Saved now; used'} by {d.laterIn.charAt(0).toLowerCase() + d.laterIn.slice(1)}</span>
          </p>
        ) : null}
        <p className="text-[var(--color-charcoal-light)]">Where the documents stood: {d.sources}</p>
        {last ? <p className="text-[var(--color-charcoal-light)]">Last changed by {last.by}, {stamp(last.at)}.</p> : null}
      </div>
    </Card>
  )
}

export default function PoliciesScreen() {
  const { toast } = useSalesToast()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const r = await fetch('/api/policies', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || 'Could not load the policies.')
      setData({ values: j.values, changed: j.changed ?? {}, canEdit: !!j.canEdit })
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(
    async (key: string, value: unknown) => {
      const r = await fetch('/api/policies', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, value }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) {
        toast(j.error || 'Could not save it.', 'bad')
        throw new Error(j.error)
      }
      setData((d) => (d ? { ...d, values: j.values, changed: j.changed ?? d.changed } : d))
      toast('Saved.', 'ok')
    },
    [toast],
  )

  const offCount = data ? DECISIONS.filter((d) => d.policies.some((p) => !same(data.values[p.key], p.recommended))).length : 0

  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-5">
      <Link href="/app/more" className="mb-3 inline-flex min-h-9 items-center gap-1 text-sm text-[var(--color-charcoal-light)]">
        <ArrowLeft className="size-4" aria-hidden="true" /> More
      </Link>
      <ScreenTitle eyebrow="Company" title="Policies">
        <p className="text-sm text-[var(--color-charcoal-light)]">
          The decisions that run a job after it is won. Each starts at our recommendation; change any of them here, and the app follows.
        </p>
      </ScreenTitle>

      {data && !data.canEdit ? (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-[var(--color-cream)] px-3 py-2 text-sm text-[var(--color-charcoal)]">
          <Lock className="size-4" aria-hidden="true" /> Only an owner changes these. You can read them.
        </p>
      ) : null}

      {error ? (
        <Card className="px-4 py-4">
          <p className="text-sm text-[#9a2a1f]">{error}</p>
          <Button className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      ) : !data ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-[var(--color-cream)]" />
          ))}
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-[var(--color-charcoal)]">
            {offCount ? `${offCount} of ${DECISIONS.length} changed from what we recommend.` : `All ${DECISIONS.length} are at what we recommend.`}
          </p>
          <nav aria-label="Policies" className="-mx-4 mb-4 flex snap-x scroll-px-4 gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {DECISIONS.map((d) => (
              <a key={d.id} href={`#${d.id}`} className="shrink-0 snap-start rounded-full border border-[var(--color-stone-mid)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-charcoal)]">
                {d.title}
              </a>
            ))}
          </nav>
          <div className="space-y-4">
            {DECISIONS.map((d) => (
              <DecisionCard key={d.id} d={d} data={data} onSave={save} />
            ))}
          </div>
          <p className="mt-6 text-xs leading-relaxed text-[var(--color-charcoal-light)]">
            Legal points (contract content, deposits, interest, liens) are for counsel to confirm, as SOP-007 says. The Mac&apos;s contract generator (bot/contract.py) reads the deposit, late interest and change-order policies when it drafts; if the site cannot be reached it uses the recommendations and says so on the draft.
          </p>
        </>
      )}
    </main>
  )
}
