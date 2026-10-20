'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Briefcase, Check, ChevronRight, Copy, ExternalLink, FileDown, Mail, MapPin, MessageSquare, PenLine, Pencil, Phone, Plus, Send, Share2, StickyNote } from 'lucide-react'

import { botApi } from '@/components/bot/BotProvider'
import { useSalesToast } from './useSalesToast'
import { Button, Card, Chip, Field, INPUT, SectionTitle } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { probabilityOf } from '@/lib/sales/pipeline'
import type { SalesSeat } from '@/lib/sales/seat'
import { DEFAULT_SETTINGS, type SignatureFont } from '@/lib/sales/settings'
import { LOST_REASONS, OPEN_STAGES, STAGE_KEYS, stageInfo, type IssuedProposal, type Opportunity, type SalesEstimate, type SalesEvent, type Stage } from '@/lib/sales/types'
import { EmailProposalSheet, type EmailDefaults } from './EmailProposalSheet'
import { ago, shortDay, stamp, todayPhoenix, usd } from './format'
import { CountersignSheet } from './pipeline/CountersignSheet'
import { DetailsSheet } from './pipeline/DetailsSheet'
import { contactLine, dialable, kindLabel, lostLabel, needsCountersign, nextMonday, plusDays, proofChip, signatureChips, sourceLabel } from './pipeline/labels'
import { NewEstimateSheet } from './pipeline/NewEstimateSheet'
import { Timeline } from './pipeline/Timeline'

// One prospect from the first call to the signed job: reach them in one tap,
// move the stage, keep the next step dated, start and send estimates, see
// whether the client opened the proposal, and the whole history underneath.

type Can = SalesSeat['can']
type SheetSettings = { email: EmailDefaults; signing: { consentText: string; companyTitle: string; fonts: SignatureFont[] } }
type Detail = {
  opportunity: Opportunity
  events: SalesEvent[]
  estimates: Omit<SalesEstimate, 'body'>[]
  proposals: IssuedProposal[]
  /** What this person may do here (absent from an older server: nothing). */
  can?: Can
  me?: { name: string; email: string }
  settings?: SheetSettings
}

const CAN_NOTHING: Can = { send: false, sign: false, openJob: false, editSettings: false, markWonLost: false }

// What the send and sign sheets start from when the server has not said.
const FALLBACK_SETTINGS: SheetSettings = {
  email: {
    subject: DEFAULT_SETTINGS.email.subject,
    body: DEFAULT_SETTINGS.email.body,
    link: DEFAULT_SETTINGS.email.defaultLink,
    attachPdf: DEFAULT_SETTINGS.email.defaultAttachPdf,
    fromName: DEFAULT_SETTINGS.email.fromName,
    fromAddress: DEFAULT_SETTINGS.email.fromAddress,
  },
  signing: { consentText: DEFAULT_SETTINGS.signing.consentText, companyTitle: DEFAULT_SETTINGS.signing.companyTitle, fonts: DEFAULT_SETTINGS.signing.fonts },
}
type LogKind = 'call' | 'text' | 'visit' | 'note' | 'email'

function Reach({ o }: { o: Opportunity }) {
  const phone = dialable(o.contact.phone)
  const links = [
    phone && { href: `tel:${phone}`, label: 'Call', icon: Phone },
    phone && { href: `sms:${phone}`, label: 'Text', icon: MessageSquare },
    o.contact.email && { href: `mailto:${o.contact.email}`, label: 'Email', icon: Mail },
    o.address && { href: `https://maps.apple.com/?q=${encodeURIComponent(o.address)}`, label: 'Map', icon: MapPin },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Phone }[]
  if (links.length === 0) return null
  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {links.map((l) => {
        const Icon = l.icon
        return (
          <a
            key={l.label}
            href={l.href}
            target={l.label === 'Map' ? '_blank' : undefined}
            rel={l.label === 'Map' ? 'noreferrer' : undefined}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--color-stone)] bg-white text-[var(--color-teal)] active:bg-[var(--color-cream)]"
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[var(--color-charcoal)]">{l.label}</span>
          </a>
        )
      })}
    </div>
  )
}

/** The open stages as a row of steps; tap one to move there. */
function Stepper({ stage, onMove, busy }: { stage: Stage; onMove: (s: Stage) => void; busy: boolean }) {
  const at = OPEN_STAGES.indexOf(stage)
  const closed = at < 0
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <ol className="flex min-w-max items-center gap-1" aria-label="Stage">
        {OPEN_STAGES.map((s, i) => {
          const done = !closed && i < at
          const here = s === stage
          return (
            <li key={s} className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy || here}
                aria-current={here ? 'step' : undefined}
                onClick={() => onMove(s)}
                className={`flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors ${
                  here
                    ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white'
                    : done
                      ? 'border-[var(--color-stone-mid)] bg-[var(--color-cream)] text-[var(--color-charcoal)]'
                      : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal-light)]'
                }`}
              >
                {done ? <Check className="size-3.5 text-[var(--color-gold-accessible)]" aria-hidden="true" /> : null}
                {stageInfo(s).short}
              </button>
              {i < OPEN_STAGES.length - 1 ? <span aria-hidden="true" className="h-px w-2 bg-[var(--color-stone-mid)]" /> : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function ProposalCard({
  p,
  o,
  can,
  settings,
  me,
  onChanged,
}: {
  p: IssuedProposal
  o: Opportunity
  can: Can
  settings: SheetSettings
  me: { name: string; email: string }
  onChanged: () => void
}) {
  const { toast } = useSalesToast()
  const [sheet, setSheet] = useState<null | 'email' | 'sign'>(null)
  const chip = proofChip(p)
  const sigChips = signatureChips(p)
  const link = () => `${window.location.origin}/d/${p.token}`
  async function copy() {
    try {
      await navigator.clipboard.writeText(link())
      toast('Client link copied', 'ok')
    } catch {
      toast(link(), 'info')
    }
  }
  async function share() {
    try {
      await navigator.share({ title: `Proposal ${p.number}`, url: link() })
    } catch {
      // The person closed the share sheet.
    }
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const countersign = can.sign && needsCountersign(p)
  const live = p.status === 'issued' && !!p.token
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-medium text-[var(--color-charcoal)]">
            {p.number} <span className="text-[var(--color-charcoal-light)]">rev {p.revision}</span>
          </p>
          <p className="text-xs text-[var(--color-charcoal-light)]">Issued {shortDay(p.issuedAt)}</p>
        </div>
        <p className="text-[15px] font-medium tabular-nums text-[var(--color-charcoal)]">{usd(p.totalCents, { whole: true })}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {chip ? <Chip tone={chip.tone}>{chip.text}</Chip> : null}
        {sigChips.map((c) => (
          <Chip key={c.text} tone={c.tone}>
            {c.text}
          </Chip>
        ))}
        {p.lastViewedAt && !p.accepted ? <span className="text-xs text-[var(--color-charcoal-light)]">last opened {stamp(p.lastViewedAt)}</span> : null}
      </div>
      {p.accepted ? (
        <p className="mt-2 rounded-xl bg-[rgba(47,107,74,0.10)] px-3 py-2 text-sm text-[#2f6b4a]">
          {p.accepted.name} accepted {p.accepted.packageName} at {usd(p.accepted.totalCents)} on {stamp(p.accepted.at)}.
        </p>
      ) : null}
      {countersign && live ? (
        <Button variant="primary" full className="mt-3" onClick={() => setSheet('sign')}>
          <PenLine className="size-4" aria-hidden="true" /> {p.signatures.some((x) => x.role === 'client') ? 'Countersign' : 'Sign for Saddlewood'}
        </Button>
      ) : null}
      {live ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {can.send ? (
            <Button onClick={() => setSheet('email')}>
              <Send className="size-4" aria-hidden="true" /> Email
            </Button>
          ) : null}
          <Button onClick={copy}>
            <Copy className="size-4" aria-hidden="true" /> Copy client link
          </Button>
          {canShare ? (
            <Button onClick={share}>
              <Share2 className="size-4" aria-hidden="true" /> Share
            </Button>
          ) : null}
          <a
            href={`/api/sales/proposals/${p.documentId}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-stone-mid)] bg-white px-4 text-sm font-medium text-[var(--color-charcoal)]"
          >
            <FileDown className="size-4" aria-hidden="true" /> PDF
          </a>
          {/* ?copy=1: our own look at it, never counted as the client's viewing. */}
          <a href={`/d/${p.token}?copy=1`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-[var(--color-teal)]">
            <ExternalLink className="size-4" aria-hidden="true" /> Open as staff
          </a>
        </div>
      ) : null}
      {sheet === 'email' ? (
        <EmailProposalSheet
          open
          onClose={() => setSheet(null)}
          documentId={p.documentId}
          opportunity={o}
          proposalTitle={o.title}
          number={p.number}
          defaults={settings.email}
          onSent={onChanged}
        />
      ) : null}
      {sheet === 'sign' ? (
        <CountersignSheet
          open
          onClose={() => setSheet(null)}
          documentId={p.documentId}
          number={p.number}
          me={me}
          consentText={settings.signing.consentText}
          companyTitle={settings.signing.companyTitle}
          fonts={settings.signing.fonts}
          onSigned={onChanged}
        />
      ) : null}
    </Card>
  )
}

const LOG: { kind: LogKind; label: string; icon: typeof Phone; prompt: string }[] = [
  { kind: 'call', label: 'Call', icon: Phone, prompt: 'What was said on the call?' },
  { kind: 'text', label: 'Text', icon: MessageSquare, prompt: 'What was texted?' },
  { kind: 'visit', label: 'Visit', icon: MapPin, prompt: 'What was seen on site?' },
  { kind: 'note', label: 'Note', icon: StickyNote, prompt: 'Note' },
]

export default function OpportunityScreen({ id }: { id: string }) {
  const { toast } = useSalesToast()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | 'details' | 'estimate' | 'lost' | 'log'>(null)
  const [logKind, setLogKind] = useState<LogKind>('note')
  const [logText, setLogText] = useState('')
  const [lostReason, setLostReason] = useState<string>('price')
  const [lostWhy, setLostWhy] = useState('')
  const [next, setNext] = useState<{ step: string; on: string } | null>(null)
  const today = todayPhoenix()

  const load = useCallback(async () => {
    try {
      const r = await botApi<Detail>(`/api/sales/${id}`)
      setD(r)
      setNext({ step: r.opportunity.nextStep, on: r.opportunity.nextStepOn ?? '' })
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    const first = window.setTimeout(load, 0)
    const onFocus = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearTimeout(first)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [load])

  async function patch(body: Record<string, unknown>, key: string, done?: string) {
    setBusy(key)
    try {
      await botApi(`/api/sales/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      if (done) toast(done, 'ok')
      await load()
      return true
    } catch (e) {
      toast((e as Error).message, 'bad')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function move(s: Stage) {
    if (!d) return
    const from = d.opportunity.stage
    const back = STAGE_KEYS.indexOf(s) < STAGE_KEYS.indexOf(from) && stageInfo(from).open
    // Going back a step is rare enough to ask about; a slip of the thumb is not a decision.
    if (back && !window.confirm(`Move back to ${stageInfo(s).label}?`)) return
    await patch({ stage: s }, 'stage', `Moved to ${stageInfo(s).label}`)
  }

  async function markLost() {
    const ok = await patch({ stage: 'lost', lostReason, why: lostWhy.trim() || undefined }, 'lost', 'Marked lost')
    if (ok) setSheet(null)
  }

  async function saveNext(on?: string) {
    if (!next) return
    const date = on ?? next.on
    setNext({ ...next, on: date })
    await patch({ nextStep: next.step.trim(), nextStepOn: date || null }, 'next', 'Next step saved')
  }

  async function log() {
    setBusy('log')
    try {
      await botApi(`/api/sales/${id}/events`, { method: 'POST', body: JSON.stringify({ kind: logKind, text: logText }) })
      setLogText('')
      setSheet(null)
      await load()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(null)
    }
  }

  async function openJob() {
    setBusy('job')
    try {
      const r = await botApi<{ jobId: string; created: boolean }>(`/api/sales/${id}/job`, { method: 'POST' })
      toast(r.created ? 'Job opened' : 'Linked to the existing job', 'ok')
      await load()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(null)
    }
  }

  if (error && !d) {
    return (
      <div className="px-4 pt-5">
        <Card className="p-4">
          <p className="text-sm text-[var(--color-charcoal)]">{error}</p>
          <Button className="mt-3" onClick={load}>
            Try again
          </Button>
        </Card>
      </div>
    )
  }
  if (!d || !next) {
    return (
      <div className="space-y-3 px-4 pt-5" aria-busy="true" aria-label="Loading">
        <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-cream)]" />
        <div className="h-14 animate-pulse rounded-2xl bg-[var(--color-cream)]" />
        <div className="h-32 animate-pulse rounded-2xl bg-[var(--color-cream)]" />
      </div>
    )
  }

  const o = d.opportunity
  const latest = d.proposals.find((p) => p.status === 'issued') ?? null
  const latestEstimate = d.estimates.find((e) => e.status !== 'archived') ?? null
  const value = latest?.accepted?.totalCents ?? latest?.totalCents ?? latestEstimate?.sellCents ?? o.valueCents
  const open = stageInfo(o.stage).open
  const nextChanged = next.step !== o.nextStep || (next.on || null) !== (o.nextStepOn ?? null)
  const versions = d.estimates
  const can = d.can ?? CAN_NOTHING
  const settings = d.settings ?? FALLBACK_SETTINGS
  const me = d.me ?? { name: '', email: '' }

  return (
    <div className="px-4 pb-24 pt-4">
      <Link href="/app/sales" className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--color-charcoal-light)]">
        <ArrowLeft className="size-4" aria-hidden="true" /> Pipeline
      </Link>

      {/* Who, what, how much. */}
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-gold-accessible)]">
          {o.number} · {kindLabel(o.kind)}
        </p>
        <h1 className="text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          {o.title}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-charcoal-light)]">{[contactLine(o), o.address].filter(Boolean).join(' · ') || 'No contact yet'}</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl tabular-nums text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
              {value > 0 ? usd(value, { whole: true }) : '—'}
            </p>
            <p className="text-xs text-[var(--color-charcoal-light)]">
              {latest?.accepted ? 'accepted' : latest ? 'proposal sent' : latestEstimate ? 'estimate' : 'rough guess'} · {open ? `${probabilityOf(o)}% likely` : stageInfo(o.stage).label}
            </p>
          </div>
          <Button variant="quiet" onClick={() => setSheet('details')}>
            <Pencil className="size-4" aria-hidden="true" /> Details
          </Button>
        </div>
        <Reach o={o} />
      </header>

      {/* Where it stands. */}
      <SectionTitle>Stage</SectionTitle>
      {open ? (
        <>
          <Stepper stage={o.stage} busy={busy === 'stage'} onMove={move} />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button className="!px-2" busy={busy === 'won'} onClick={() => patch({ stage: 'won' }, 'won', 'Marked won')}>
              Won
            </Button>
            <Button className="!px-2" variant="danger" onClick={() => setSheet('lost')}>
              Lost
            </Button>
            <Button className="!px-2" busy={busy === 'no_bid'} onClick={() => patch({ stage: 'no_bid', why: 'Passed on it' }, 'no_bid', 'Marked no bid')}>
              No bid
            </Button>
          </div>
        </>
      ) : (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Chip tone={o.stage === 'won' ? 'ok' : 'quiet'}>{stageInfo(o.stage).label}</Chip>
              {o.closedAt ? <span className="ml-2 text-xs text-[var(--color-charcoal-light)]">{shortDay(o.closedAt)}</span> : null}
              {o.stage === 'lost' && o.lostReason ? <p className="mt-1 text-sm text-[var(--color-charcoal-light)]">{lostLabel(o.lostReason)}</p> : null}
            </div>
            <Button variant="quiet" busy={busy === 'reopen'} onClick={() => patch({ stage: 'negotiating', why: 'Reopened' }, 'reopen', 'Reopened')}>
              Reopen
            </Button>
          </div>
          {o.stage === 'won' && !o.jobId ? (
            <div className="mt-3 border-t border-[var(--color-stone)] pt-3">
              <p className="mb-2 text-sm text-[var(--color-charcoal)]">
                {latest?.accepted ? `Accepted by ${latest.accepted.name}.` : 'Won.'} Open the job so the crew, billing and job cost can use it.
              </p>
              {can.openJob ? (
                <Button variant="primary" full busy={busy === 'job'} onClick={openJob}>
                  <Briefcase className="size-4" aria-hidden="true" /> Open the job
                </Button>
              ) : (
                <p className="text-xs text-[var(--color-charcoal-light)]">An owner opens the job.</p>
              )}
            </div>
          ) : null}
          {o.jobId ? <p className="mt-2 text-xs text-[var(--color-charcoal-light)]">Job opened.</p> : null}
        </Card>
      )}

      {/* What happens next, and when. */}
      {open ? (
        <>
          <SectionTitle>Next step</SectionTitle>
          <Card className="p-4">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input className={INPUT} aria-label="Next step" value={next.step} onChange={(e) => setNext({ ...next, step: e.target.value })} placeholder="Call back, site walk, send the estimate" />
              <input className={`${INPUT} w-[150px]`} aria-label="When" type="date" value={next.on} onChange={(e) => setNext({ ...next, on: e.target.value })} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { label: 'Tomorrow', on: plusDays(today, 1) },
                { label: '+3 days', on: plusDays(today, 3) },
                { label: 'Next week', on: nextMonday(today) },
              ].map((q) => (
                <Button key={q.label} variant={next.on === q.on ? 'primary' : 'secondary'} className="!min-h-10 !px-3 text-[13px]" disabled={busy === 'next'} onClick={() => saveNext(q.on)}>
                  {q.label}
                </Button>
              ))}
              {nextChanged ? (
                <Button variant="primary" className="!min-h-10 !px-3 text-[13px]" busy={busy === 'next'} onClick={() => saveNext()}>
                  Save
                </Button>
              ) : null}
            </div>
            {o.nextStepOn && o.nextStepOn < today ? <p className="mt-2 text-xs font-medium text-[#9a2a1f]">Was due {shortDay(o.nextStepOn)}.</p> : null}
            {o.bidDue ? <p className="mt-2 text-xs text-[var(--color-charcoal-light)]">Bid due {shortDay(o.bidDue)}</p> : null}
          </Card>
        </>
      ) : null}

      {/* Estimates: the working versions. */}
      <SectionTitle
        count={versions.length}
        action={
          <Button variant="quiet" className="!min-h-9 !px-2 text-[13px]" onClick={() => setSheet('estimate')}>
            <Plus className="size-4" aria-hidden="true" /> New
          </Button>
        }
      >
        Estimates
      </SectionTitle>
      {versions.length === 0 ? (
        <button type="button" onClick={() => setSheet('estimate')} className="w-full rounded-2xl border border-dashed border-[var(--color-stone-mid)] px-4 py-5 text-left text-sm text-[var(--color-charcoal-light)] active:bg-[var(--color-cream)]">
          No estimate yet. <span className="font-medium text-[var(--color-teal)]">Start one</span>: a quick price on site, or a full build-up.
        </button>
      ) : (
        <Card className="divide-y divide-[var(--color-stone)]">
          {versions.map((v) => (
            <Link key={v.id} href={`/app/sales/estimate/${v.id}`} className={`flex items-center gap-3 px-4 py-3 active:bg-[var(--color-cream)] ${v.status === 'archived' ? 'opacity-50' : ''}`}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream)] font-mono text-xs text-[var(--color-gold-accessible)]">v{v.version}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-[var(--color-charcoal)]">{v.name || `Version ${v.version}`}</span>
                <span className="block text-xs text-[var(--color-charcoal-light)]">
                  {v.status === 'issued' ? 'Sent' : v.status === 'archived' ? 'Archived' : 'Draft'} · edited {ago(v.updatedAt)}
                </span>
              </span>
              <span className="shrink-0 text-[15px] tabular-nums text-[var(--color-charcoal)]">{v.sellCents ? usd(v.sellCents, { whole: true }) : '—'}</span>
              <ChevronRight className="size-4 shrink-0 text-[var(--color-charcoal-light)]" aria-hidden="true" />
            </Link>
          ))}
        </Card>
      )}

      {/* Proposals: what the client was sent, and whether they opened it. */}
      {d.proposals.length ? (
        <>
          <SectionTitle count={d.proposals.length}>Proposals</SectionTitle>
          <div className="space-y-2">
            {d.proposals.map((p) => (
              <ProposalCard key={p.documentId} p={p} o={o} can={can} settings={settings} me={me} onChanged={load} />
            ))}
          </div>
        </>
      ) : null}

      {/* Log what happened, then the history. */}
      <SectionTitle>Log</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {LOG.map((l) => {
          const Icon = l.icon
          return (
            <button
              key={l.kind}
              type="button"
              onClick={() => {
                setLogKind(l.kind)
                setSheet('log')
              }}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--color-stone)] bg-white text-[var(--color-charcoal)] active:bg-[var(--color-cream)]"
            >
              <Icon className="size-4 text-[var(--color-gold-accessible)]" aria-hidden="true" />
              <span className="text-[12px] font-medium">{l.label}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-3">
        <Timeline events={d.events} />
      </div>
      <p className="mt-3 text-center text-[11px] text-[var(--color-charcoal-light)]">
        {sourceLabel(o.source)} · started {shortDay(o.createdAt)}
      </p>

      <NewEstimateSheet open={sheet === 'estimate'} onClose={() => setSheet(null)} opportunityId={o.id} kind={o.kind} versions={versions} />
      {sheet === 'details' ? (
        <DetailsSheet
          open
          o={o}
          onClose={() => setSheet(null)}
          onSaved={() => {
            toast('Saved', 'ok')
            load()
          }}
        />
      ) : null}

      <BottomSheet isOpen={sheet === 'lost'} onClose={() => setSheet(null)} title="Why was it lost?" maxHeightDvh={80} narrow>
        <div className="space-y-4 px-5 pb-6 pt-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Reason">
            {LOST_REASONS.map((r) => (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={lostReason === r.key}
                onClick={() => setLostReason(r.key)}
                className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${
                  lostReason === r.key ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Field label="What happened" hint="Who got it, at what price, what to do differently. Optional.">
            <textarea className={INPUT} rows={3} value={lostWhy} onChange={(e) => setLostWhy(e.target.value)} />
          </Field>
          <Button variant="danger" full busy={busy === 'lost'} onClick={markLost}>
            Mark lost
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={sheet === 'log'} onClose={() => setSheet(null)} title={`Log a ${LOG.find((l) => l.kind === logKind)?.label.toLowerCase() ?? 'note'}`} maxHeightDvh={70} narrow>
        <div className="space-y-4 px-5 pb-6 pt-4">
          <textarea
            className={INPUT}
            rows={4}
            autoFocus
            aria-label={LOG.find((l) => l.kind === logKind)?.prompt}
            placeholder={LOG.find((l) => l.kind === logKind)?.prompt}
            value={logText}
            onChange={(e) => setLogText(e.target.value)}
          />
          <Button variant="primary" full busy={busy === 'log'} disabled={!logText.trim()} onClick={log}>
            Save to the timeline
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
