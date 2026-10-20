'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, Lock, Plus, RotateCcw, Trash2 } from 'lucide-react'

import { Button, Field, INPUT, ScreenTitle } from '@/components/bot/ui'
import { NumberField, Panel, Pill, Toggle } from '@/components/sales/builder/fields'
import { DEFAULT_SETTINGS, RECIPIENT_RULES, SIGNATURE_FONTS, type CompanyActors, type RecipientRule, type SalesSettings, type SignatureFont } from '@/lib/sales/settings'
import { ALLOWANCE_DISPLAYS, MARKUP_DISPLAYS, PRESENT_LAYOUTS, SIGNING_MODES, type Presentation, type Pricing } from '@/lib/sales/types'
import { stamp, personName } from './format'
import { SIGNATURE_FAMILY, SIGNATURE_SCALE } from './signatureFonts'

// Sales settings: every choice the owners made about estimates and proposals,
// in one place they can change without a code change. New estimates start
// from these; each estimate can still change any of them for itself (Present
// tab). Owners edit; everyone else with Sales can read why things are as they are.

const COMPANY = /^[^\s@<>,;"]+@saddlewoodcontracting\.com$/i

type Load = { ok: true; settings: SalesSettings; canEdit: boolean }

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { key: T; label: string; hint: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="space-y-2" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={`flex min-h-12 w-full flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
              on ? 'border-[var(--color-teal)] bg-[var(--color-cream)] ring-1 ring-[var(--color-teal)]' : 'border-[var(--color-stone-mid)] bg-white'
            }`}
          >
            <span className="text-sm font-medium text-[var(--color-charcoal)]">{o.label}</span>
            <span className="text-[11px] text-[var(--color-charcoal-light)]">{o.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

function Who({ value, onChange, label }: { value: CompanyActors; onChange: (v: CompanyActors) => void; label: string }) {
  return (
    <Choice
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { key: 'owners', label: 'Owners only', hint: 'Marco, Lando or Ilene, signed in' },
        { key: 'owners_and_sales', label: 'Owners and sales', hint: 'Also office staff, and crew seats with the Sales send switch' },
      ]}
    />
  )
}

function Strings({ items, onChange, label, placeholder, check }: { items: string[]; onChange: (l: string[]) => void; label: string; placeholder: string; check?: (s: string) => string | null }) {
  const [draft, setDraft] = useState('')
  const problem = draft.trim() && check ? check(draft.trim()) : null
  const add = () => {
    const v = draft.trim()
    if (!v || problem || items.includes(v)) return
    onChange([...items, v])
    setDraft('')
  }
  return (
    <div>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            <textarea
              rows={Math.max(1, Math.ceil(t.length / 46))}
              className={`${INPUT} py-1.5 text-sm`}
              value={t}
              aria-label={`${label} ${i + 1}`}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))} className="inline-flex size-11 shrink-0 items-center justify-center text-[#9a2a1f]">
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          className={`${INPUT} py-1.5 text-sm`}
          placeholder={placeholder}
          aria-label={`Add ${label.toLowerCase()}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button
          type="button"
          aria-label={`Add ${label.toLowerCase()}`}
          disabled={!draft.trim() || !!problem}
          onClick={add}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--color-stone-mid)] bg-white text-[var(--color-teal)] disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
      {problem ? <p className="mt-1 text-xs text-[#9a2a1f]">{problem}</p> : null}
    </div>
  )
}

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <Panel title={title}>
      {hint ? <p className="mb-3 text-xs text-[var(--color-charcoal-light)]">{hint}</p> : null}
      {children}
    </Panel>
  )
}

/** Problems that stop a save, in words. The server checks again and falls back to defaults on anything it cannot use. */
export function settingsProblems(s: SalesSettings): string[] {
  const out: string[] = []
  if (!COMPANY.test(s.email.fromAddress.trim())) out.push('The "from" address must be an @saddlewoodcontracting.com address.')
  if (!COMPANY.test(s.email.replyTo.trim())) out.push('The reply-to address must be an @saddlewoodcontracting.com address.')
  if (s.email.notify.internalCc.some((a) => !COMPANY.test(a.trim()))) out.push('Internal copies go to company addresses only.')
  if (!s.email.defaultLink && !s.email.defaultAttachPdf) out.push('Proposal email needs the link, the PDF, or both.')
  if (s.signing.fonts.length === 0) out.push('Keep at least one signature style.')
  if (s.signing.consentText.trim().length < 20) out.push('The signing consent needs its full wording.')
  if (!s.proposal.terms.trim()) out.push('Terms are empty.')
  const sum = s.proposal.schedule.reduce((a, x) => a + (Number(x.pct) || 0), 0)
  if (s.proposal.schedule.length && Math.abs(sum - 100) > 0.001) out.push(`The default payment schedule adds up to ${sum}%, not 100%.`)
  return out
}

export default function SettingsScreen({ canEdit: canEditProp }: { canEdit: boolean }) {
  const [saved, setSaved] = useState<SalesSettings | null>(null)
  const [s, setS] = useState<SalesSettings | null>(null)
  const [canEdit, setCanEdit] = useState(canEditProp)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setErr('')
    try {
      const res = await fetch('/api/sales/settings', { cache: 'no-store' })
      const j = (await res.json().catch(() => ({}))) as Partial<Load> & { error?: string }
      if (!res.ok || !j.ok || !j.settings) throw new Error(j.error || `could not load settings (${res.status})`)
      setSaved(j.settings)
      setS(structuredClone(j.settings))
      setCanEdit(!!j.canEdit)
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(load, 0)
    return () => window.clearTimeout(t)
  }, [load])

  const dirty = useMemo(() => !!s && !!saved && JSON.stringify(s) !== JSON.stringify(saved), [s, saved])
  const problems = useMemo(() => (s ? settingsProblems(s) : []), [s])

  async function save() {
    if (!s) return
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/api/sales/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: s }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || `could not save (${res.status})`)
      setSaved(j.settings)
      setS(structuredClone(j.settings))
      setNote('Saved. New estimates start from these.')
      window.setTimeout(() => setNote(''), 4000)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!s) {
    return (
      <div className="px-4 pt-5">
        {err ? (
          <div className="rounded-2xl border border-[var(--color-stone)] bg-white p-4">
            <p className="text-sm">{err}</p>
            <Button className="mt-3" onClick={load}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="space-y-3" aria-busy="true" aria-label="Loading">
            <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-cream)]" />
            <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-cream)]" />
          </div>
        )}
      </div>
    )
  }

  // Small setters so each control reads as what it changes.
  const pricing = <K extends keyof Pricing>(k: K, v: Pricing[K]) => setS({ ...s, pricing: { ...s.pricing, [k]: v } })
  const present = (patch: Partial<Presentation>) => setS({ ...s, proposal: { ...s.proposal, present: { ...s.proposal.present, ...patch } } })
  const proposal = (patch: Partial<SalesSettings['proposal']>) => setS({ ...s, proposal: { ...s.proposal, ...patch } })
  const signing = (patch: Partial<SalesSettings['signing']>) => setS({ ...s, signing: { ...s.signing, ...patch } })
  const email = (patch: Partial<SalesSettings['email']>) => setS({ ...s, email: { ...s.email, ...patch } })
  const notify = (patch: Partial<SalesSettings['email']['notify']>) => setS({ ...s, email: { ...s.email, notify: { ...s.email.notify, ...patch } } })
  const pr = s.proposal.present
  const scheduleSum = s.proposal.schedule.reduce((a, x) => a + (Number(x.pct) || 0), 0)
  const pct = (label: string, k: keyof Pricing, max = 100) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium">{label}</span>
      <NumberField label={label} suffix="%" max={max} value={s.pricing[k] as number} onChange={(v) => pricing(k, v as never)} />
    </label>
  )

  return (
    <div className={`px-4 pt-4 ${dirty ? 'pb-40' : 'pb-24'}`}>
      <Link href="/app/sales" className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--color-charcoal-light)]">
        <ArrowLeft className="size-4" aria-hidden="true" /> Pipeline
      </Link>
      <ScreenTitle eyebrow="Sales" title="Settings">
        <p className="text-sm text-[var(--color-charcoal-light)]">New estimates start from these. Each estimate can still change any of them on its Present and Price tabs.</p>
        {saved?.updatedAt ? (
          <p className="mt-1 text-xs text-[var(--color-charcoal-light)]">
            Last changed by {personName(saved.updatedBy ?? '')} on {stamp(saved.updatedAt)}
          </p>
        ) : null}
        {!canEdit ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-cream)] px-3 py-1 text-xs text-[var(--color-charcoal)]">
            <Lock className="size-3.5" aria-hidden="true" /> Read only: an owner changes these.
          </p>
        ) : null}
      </ScreenTitle>

      {/* One switch locks every field for someone who may only read. */}
      <fieldset disabled={!canEdit} className="space-y-3 disabled:opacity-90">
        <Section title="Pricing defaults" hint="The markups a new estimate starts with. Rates are fully loaded: never add burden on top.">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Labor rate (loaded)</span>
              <NumberField label="Labor rate" prefix="$" suffix="/hr" value={s.pricing.laborRate} onChange={(v) => pricing('laborRate', v)} />
            </label>
            {pct('Contingency', 'contingencyPct')}
            {pct('Overhead', 'overheadPct')}
            {pct('Profit', 'profitPct')}
            {pct('GC markup on subs', 'subMarkupPct')}
            {pct('Material tax', 'materialTaxPct', 20)}
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Round prices up to</span>
              <select className={INPUT} value={s.pricing.roundTo} onChange={(e) => pricing('roundTo', Number(e.target.value))}>
                {[0, 1, 10, 50, 100, 500].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'The cent' : `$${n}`}
                  </option>
                ))}
              </select>
            </label>
            {pct('Margin floor', 'marginFloorPct', 90)}
          </div>
        </Section>

        <Section title="How proposals look" hint="The starting presentation. The Present tab's variations and switches change it per estimate.">
          <p className="mb-1.5 text-xs font-medium">Layout</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {PRESENT_LAYOUTS.map((l) => (
              <Pill key={l.key} on={pr.layout === l.key} title={l.hint} onClick={() => present({ layout: l.key })}>
                {l.label}
              </Pill>
            ))}
          </div>
          <p className="mb-1.5 text-xs font-medium">Overhead and profit</p>
          <Choice label="Overhead and profit" value={pr.markupDisplay} options={MARKUP_DISPLAYS} onChange={(v) => present({ markupDisplay: v })} />
          <p className="mb-1.5 mt-4 text-xs font-medium">Allowances</p>
          {pr.markupDisplay === 'line' ? (
            <p className="mb-2 text-[11px] text-[var(--color-charcoal-light)]">With overhead and profit on their own line, allowances always show at budget.</p>
          ) : null}
          <Choice label="Allowances" value={pr.allowanceDisplay} options={ALLOWANCE_DISPLAYS} onChange={(v) => present({ allowanceDisplay: v })} />
          <div className="mt-2 divide-y divide-[var(--color-stone)]">
            <Toggle on={pr.showAllowanceAmounts} onChange={(v) => present({ showAllowanceAmounts: v })} label="Show allowance amounts" hint="Off: allowances are named, their values stay inside the price" />
            <Toggle on={pr.showOptions} onChange={(v) => present({ showOptions: v })} label="Add-ons the client can tick" />
            <Toggle on={pr.showPackages} onChange={(v) => present({ showPackages: v })} label="Let the client choose a package" hint="When an estimate has packages" />
            <Toggle on={pr.showQuantities} onChange={(v) => present({ showQuantities: v })} label="Quantities (every-line layout)" />
            <Toggle on={pr.showUnitPrices} onChange={(v) => present({ showUnitPrices: v })} label="Unit prices (every-line layout)" />
            <Toggle on={pr.showSectionNotes} onChange={(v) => present({ showSectionNotes: v })} label="Section notes" />
            <Toggle on={pr.showTimeline} onChange={(v) => present({ showTimeline: v })} label="Timeline" />
            <Toggle on={pr.showSchedule} onChange={(v) => present({ showSchedule: v })} label="Payment schedule" />
            <Toggle on={pr.showExclusions} onChange={(v) => present({ showExclusions: v })} label="What is not included" />
            <Toggle on={pr.allowAccept} onChange={(v) => present({ allowAccept: v })} label="Accept on the link" />
          </div>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium">Proposals are valid for</span>
            <NumberField label="Valid days" suffix="days" min={1} max={365} value={s.proposal.validDays} onChange={(v) => proposal({ validDays: Math.round(v) || 30 })} />
          </label>
        </Section>

        <Section title="Terms" hint="One term per line. The default is SOP-007's short form (Marco's values, pending counsel's review).">
          <textarea className={`${INPUT} text-sm`} rows={10} value={s.proposal.terms} onChange={(e) => proposal({ terms: e.target.value })} aria-label="Default terms" />
          <button
            type="button"
            onClick={() => proposal({ terms: DEFAULT_SETTINGS.proposal.terms })}
            className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[var(--color-teal)] disabled:opacity-40"
          >
            <RotateCcw className="size-4" aria-hidden="true" /> Reset to the SOP-007 default
          </button>
        </Section>

        <Section title="Default payment schedule" hint="What a new residential estimate starts with. Framing packages bill twice a month instead.">
          <ul className="space-y-1.5">
            {s.proposal.schedule.map((step, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  className={`${INPUT} py-1.5 text-sm`}
                  aria-label={`Payment step ${i + 1}`}
                  value={step.label}
                  onChange={(e) => proposal({ schedule: s.proposal.schedule.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                />
                <NumberField
                  label={`Percent for step ${i + 1}`}
                  suffix="%"
                  className="w-24 shrink-0"
                  value={step.pct}
                  onChange={(v) => proposal({ schedule: s.proposal.schedule.map((x, j) => (j === i ? { ...x, pct: v } : x)) })}
                />
                <button type="button" aria-label="Remove step" onClick={() => proposal({ schedule: s.proposal.schedule.filter((_, j) => j !== i) })} className="inline-flex size-11 shrink-0 items-center justify-center text-[#9a2a1f]">
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => proposal({ schedule: [...s.proposal.schedule, { label: '', pct: Math.max(0, 100 - scheduleSum) }] })}
              className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[var(--color-teal)]"
            >
              <Plus className="size-4" aria-hidden="true" /> Add a step
            </button>
            <span className={`text-xs tabular-nums ${Math.abs(scheduleSum - 100) > 0.001 ? 'text-[#9a2a1f]' : 'text-[var(--color-charcoal-light)]'}`}>{scheduleSum}%</span>
          </div>
        </Section>

        <Section title="Exclusions library" hint="Offered as one-tap additions on the Present tab.">
          <Strings label="Exclusion" placeholder="Add an exclusion…" items={s.proposal.exclusions} onChange={(l) => proposal({ exclusions: l })} />
        </Section>
        <Section title="Clarifications library">
          <Strings label="Clarification" placeholder="Add a clarification…" items={s.proposal.clarifications} onChange={(l) => proposal({ clarifications: l })} />
        </Section>

        <Section title="Signing" hint="Who signs is set per proposal (Present tab); this is where a new one starts, and how signing works.">
          <p className="mb-1.5 text-xs font-medium">Who signs a new proposal</p>
          <Choice label="Who signs" value={pr.signing} options={SIGNING_MODES} onChange={(v) => present({ signing: v })} />
          <p className="mb-1.5 mt-4 text-xs font-medium">Who may countersign for Saddlewood</p>
          <Who label="Who countersigns" value={s.signing.companySigners} onChange={(v) => signing({ companySigners: v })} />
          <div className="mt-4 space-y-3">
            <Field label="Printed under our signature">
              <input className={INPUT} value={s.signing.companyTitle} onChange={(e) => signing({ companyTitle: e.target.value })} />
            </Field>
            <Field label="What the signer agrees to" hint="Shown above every signature and kept with it.">
              <textarea className={`${INPUT} text-sm`} rows={4} value={s.signing.consentText} onChange={(e) => signing({ consentText: e.target.value })} />
            </Field>
          </div>
          <p className="mb-1.5 mt-4 text-xs font-medium">Signature styles offered for a typed signature</p>
          <div className="grid grid-cols-2 gap-2">
            {SIGNATURE_FONTS.map((f) => {
              const on = s.signing.fonts.includes(f.key)
              const only = on && s.signing.fonts.length === 1
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  aria-label={f.label}
                  title={only ? 'Keep at least one style' : f.label}
                  onClick={() => {
                    if (only) return
                    signing({ fonts: on ? s.signing.fonts.filter((x) => x !== f.key) : [...s.signing.fonts, f.key as SignatureFont] })
                  }}
                  className={`flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 py-1 transition-colors ${on ? 'border-[var(--color-teal)] bg-[var(--color-cream)]' : 'border-[var(--color-stone-mid)] bg-white opacity-50'}`}
                >
                  <span className="truncate text-[#1b2f6b]" style={{ fontFamily: SIGNATURE_FAMILY[f.key], fontSize: `${24 * SIGNATURE_SCALE[f.key]}px`, lineHeight: 1.3 }}>
                    Your Signature
                  </span>
                  <span className="text-[10px] text-[var(--color-charcoal-light)]">{f.label}</span>
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="Proposal email" hint="When a proposal is emailed from the app. Every send shows a preview first.">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="From name">
                <input className={INPUT} value={s.email.fromName} onChange={(e) => email({ fromName: e.target.value })} />
              </Field>
              <Field label="From address">
                <input className={INPUT} inputMode="email" value={s.email.fromAddress} onChange={(e) => email({ fromAddress: e.target.value.trim().toLowerCase() })} />
              </Field>
            </div>
            {!COMPANY.test(s.email.fromAddress) ? <p className="-mt-2 text-xs text-[#9a2a1f]">Must be an @saddlewoodcontracting.com address.</p> : null}
            <Field label="Replies go to">
              <input className={INPUT} inputMode="email" value={s.email.replyTo} onChange={(e) => email({ replyTo: e.target.value.trim().toLowerCase() })} />
            </Field>
            {!COMPANY.test(s.email.replyTo) ? <p className="-mt-2 text-xs text-[#9a2a1f]">Must be an @saddlewoodcontracting.com address.</p> : null}
            <Field label="Subject">
              <input className={INPUT} value={s.email.subject} onChange={(e) => email({ subject: e.target.value })} />
            </Field>
            <Field label="Message" hint="{first} the client's first name · {title} the proposal · {number} its number · {company} their company · {link} where the button goes">
              <textarea className={`${INPUT} text-sm`} rows={8} value={s.email.body} onChange={(e) => email({ body: e.target.value })} />
            </Field>
            <button
              type="button"
              onClick={() => email({ subject: DEFAULT_SETTINGS.email.subject, body: DEFAULT_SETTINGS.email.body })}
              className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[var(--color-teal)]"
            >
              <RotateCcw className="size-4" aria-hidden="true" /> Reset the wording
            </button>
          </div>
          <p className="mb-1 mt-3 text-xs font-medium">Sent by default with</p>
          <div className="divide-y divide-[var(--color-stone)]">
            <Toggle on={s.email.defaultLink} onChange={(v) => (v || s.email.defaultAttachPdf) && email({ defaultLink: v })} label="The link" hint="They choose, accept and sign on the page; openings are recorded" />
            <Toggle on={s.email.defaultAttachPdf} onChange={(v) => (v || s.email.defaultLink) && email({ defaultAttachPdf: v })} label="The PDF attached" />
          </div>
          <p className="mb-1.5 mt-3 text-xs font-medium">Who may issue and email proposals</p>
          <Who label="Who sends" value={s.email.whoMaySend} onChange={(v) => email({ whoMaySend: v })} />
          <p className="mb-1.5 mt-3 text-xs font-medium">Who a proposal can be emailed to</p>
          <Choice<RecipientRule>
            label="Proposal recipients"
            value={s.email.recipients}
            onChange={(v) => email({ recipients: v })}
            options={RECIPIENT_RULES.map((r) => ({ key: r.key, label: r.label, hint: r.hint }))}
          />
          <p className="mt-1.5 text-[11px] text-[var(--color-charcoal-light)]">
            The bot&apos;s automated replies and billing mail always keep to the owner&apos;s allowlist; this is only for proposals a person sends.
          </p>
        </Section>

        <Section title="Signing notifications" hint="Emails that go out on their own when a signature comes in.">
          <div className="divide-y divide-[var(--color-stone)]">
            <Toggle on={s.email.notify.companyOnClientSign} onChange={(v) => notify({ companyOnClientSign: v })} label="Tell us when the client signs" hint="To the sales lane (Marco), plus the copies below" />
            <Toggle on={s.email.notify.clientCopyOnSign} onChange={(v) => notify({ clientCopyOnSign: v })} label="Send the client a copy of what they signed" />
            <Toggle on={s.email.notify.clientOnExecuted} onChange={(v) => notify({ clientOnExecuted: v })} label="Send the client the fully signed copy" hint="When every signature is on it" />
            <Toggle on={s.email.notify.companyOnExecuted} onChange={(v) => notify({ companyOnExecuted: v })} label="Tell us when it is fully signed" />
            <Toggle on={s.email.notify.attachPdf} onChange={(v) => notify({ attachPdf: v })} label="Attach the signed PDF to these" />
          </div>
          <p className="mb-1.5 mt-3 text-xs font-medium">Also copy (company addresses)</p>
          <Strings
            label="Internal copy"
            placeholder="info@saddlewoodcontracting.com"
            items={s.email.notify.internalCc}
            onChange={(l) => notify({ internalCc: l.map((a) => a.trim().toLowerCase()) })}
            check={(a) => (COMPANY.test(a) ? null : 'Company addresses only (@saddlewoodcontracting.com).')}
          />
          <p className="mt-3 rounded-xl bg-[var(--color-cream)] px-3 py-2 text-xs text-[var(--color-charcoal)]">
            {s.email.recipients === 'allowlist'
              ? "Client emails only go to addresses on the owner's outbound allowlist. Any other address is skipped, and the timeline says so with the command an owner runs to allow it."
              : 'The client gets these at the addresses the proposal was emailed to and the email they gave when signing. With neither, the timeline says the copy was not sent.'}
          </p>
        </Section>
      </fieldset>

      {/* Save bar: only while there is something to save. */}
      {canEdit && dirty ? (
        <div className="fixed inset-x-0 z-20 border-t border-[var(--color-stone)] bg-[var(--color-background)]/95 px-4 py-3 backdrop-blur" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="mx-auto max-w-xl">
            {problems.length ? <p className="mb-2 text-xs text-[#9a2a1f]">{problems[0]}</p> : err ? <p className="mb-2 text-xs text-[#9a2a1f]">{err}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => saved && setS(structuredClone(saved))}>Discard</Button>
              <Button variant="primary" busy={busy} disabled={problems.length > 0} onClick={save}>
                Save settings
              </Button>
            </div>
          </div>
        </div>
      ) : note ? (
        <p role="status" className="fixed inset-x-0 z-20 mx-auto max-w-xl px-4 text-center text-sm text-[#2f6b4a]" style={{ bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}>
          {note}
        </p>
      ) : null}
    </div>
  )
}
