'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, ExternalLink, FileDown, Paperclip, Pencil, Send, Trophy, UserPlus, X } from 'lucide-react'

import { botApi } from '@/components/bot/BotProvider'
import { Button, Card, Chip, Empty, INPUT, SectionTitle } from '@/components/bot/ui'
import { shortDay, stamp, usd } from '@/components/sales/format'
import { useSalesToast } from '@/components/sales/useSalesToast'
import { createClient } from '@/lib/supabase/client'
import type { AwardCheck, Leveling, Readiness } from '@/lib/subs/rules'
import type { EmailDraftView, WorkOrderView } from '@/lib/subs/scorecard'
import type { InviteRowView } from '@/lib/subs/store'
import type { Addendum, BidEvent, BidPackage } from '@/lib/subs/types'
import { AwardBidSheet, InviteSheet, MailSheet, PackageEditor } from './PackageSheets'
import { SubSheet } from './SubSheet'
import { STATUS_CHIP } from './SubsScreen'

// One bid package from first draft to award: the scope and plans, who is
// asked, what came back, the leveling sheet (our scope at each sub's price,
// our cost wherever they left a gap), and the award.

type InviteView = InviteRowView & { readiness: Readiness; award: AwardCheck | null }
type Detail = {
  pkg: BidPackage
  job: { name: string; address: string }
  addenda: Addendum[]
  invites: InviteView[]
  events: BidEvent[]
  leveling: Leveling
  workOrder?: WorkOrderView | null
  emailDrafts?: { awardDraft: EmailDraftView | null; thankYouDrafts: EmailDraftView[] }
  can: { manage: boolean; award: boolean }
  minBids: number
  minBidsFromCents: number
}

const INVITE_CHIP: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'quiet' | 'ink' }> = {
  invited: { label: 'Asked', tone: 'quiet' },
  declined: { label: 'Passed', tone: 'quiet' },
  submitted: { label: 'Bid in', tone: 'ink' },
  awarded: { label: 'Awarded', tone: 'ok' },
  not_awarded: { label: 'Not chosen', tone: 'quiet' },
}

const EVENT_TEXT: Record<string, string> = {
  created: 'Package started',
  invited: 'Added',
  sent: 'Invite emailed',
  viewed: 'Opened their link',
  downloaded: 'Downloaded',
  submitted: 'Bid sent',
  declined: 'Passed',
  addendum: 'Addendum',
  awarded: 'Awarded',
  not_awarded: 'Not chosen',
  thanked: 'Thank-you sent',
  note: 'Note',
  reopened: 'Bidding reopened',
  cancelled: 'Cancelled',
}

export default function PackageScreen({ id }: { id: string }) {
  const { toast } = useSalesToast()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [sheet, setSheet] = useState<null | 'edit' | 'invite' | 'newsub' | 'award' | 'invite-mail' | 'addendum-mail' | 'thanks-mail'>(null)
  const [awarding, setAwarding] = useState<{ inviteId: string; sub: string; leveledCents: number; headlineCents: number; warnings: string[] } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [levelEdit, setLevelEdit] = useState<{ inviteId: string; amount: string; note: string } | null>(null)

  const load = useCallback(async () => {
    try {
      setD(await botApi<Detail>(`/api/bids/${id}`))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    // The first load, and again whenever the phone comes back to the app: a sub may have bid meanwhile.
    const first = window.setTimeout(load, 0)
    const onFocus = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearTimeout(first)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [load])

  async function status(s: 'out' | 'closed' | 'cancelled') {
    setBusy(s)
    try {
      await botApi(`/api/bids/${id}`, { method: 'PATCH', body: JSON.stringify({ status: s }) })
      await load()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(null)
    }
  }

  async function upload(list: FileList | null) {
    if (!list?.length) return
    setBusy('upload')
    try {
      for (const f of Array.from(list)) {
        const slot = await botApi<{ bucket: string; path: string; token: string; file: { path: string; name: string; size: number; type: string } }>(`/api/bids/${id}/files`, {
          method: 'POST',
          body: JSON.stringify({ name: f.name, type: f.type, size: f.size }),
        })
        const { error: upErr } = await createClient().storage.from(slot.bucket).uploadToSignedUrl(slot.path, slot.token, f, { contentType: f.type })
        if (upErr) throw new Error(upErr.message)
        await botApi(`/api/bids/${id}/files`, { method: 'PUT', body: JSON.stringify(slot.file) })
      }
      await load()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(null)
    }
  }

  async function removeFile(fileId: string) {
    try {
      await botApi(`/api/bids/${id}/files?fileId=${fileId}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  async function withdraw(inviteId: string) {
    try {
      await botApi(`/api/bids/${id}/invites`, { method: 'POST', body: JSON.stringify({ withdraw: inviteId }) })
      await load()
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  async function saveLevel() {
    if (!levelEdit) return
    const c = Math.round(Number(levelEdit.amount.replace(/[$,\s]/g, '')) * 100)
    if (!Number.isFinite(c)) return toast('That is not an amount', 'bad')
    setBusy('level')
    try {
      await botApi(`/api/bids/${id}/invites`, { method: 'POST', body: JSON.stringify({ level: { inviteId: levelEdit.inviteId, cents: c, note: levelEdit.note } }) })
      setLevelEdit(null)
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
  if (!d) return <div className="mx-4 mt-5 h-40 animate-pulse rounded-2xl bg-[var(--color-cream)]" aria-busy="true" aria-label="Loading" />

  const { pkg } = d
  const lvSheet = d.leveling
  const unsent = d.invites.filter((i) => i.status === 'invited' && !i.sentAt).length
  const sentOnce = d.invites.some((i) => i.sentAt)
  const notChosen = d.invites.filter((i) => i.status === 'not_awarded').length
  const bids = d.invites.filter((i) => i.latest)
  const ranked = [...bids].sort((a, b) => (lvSheet.bids.find((x) => x.inviteId === a.id)?.rank ?? 99) - (lvSheet.bids.find((x) => x.inviteId === b.id)?.rank ?? 99))
  const lineName = (lineId: string) => pkg.lines.find((l) => l.id === lineId)?.description ?? 'a line no longer in the package'
  const shortBids = lvSheet.budgetCents >= d.minBidsFromCents && d.invites.length < d.minBids
  const editable = d.can.manage && pkg.status !== 'awarded' && pkg.status !== 'cancelled'
  const lastAddendum = d.addenda[d.addenda.length - 1]
  const addendumUnsent = lastAddendum && sentOnce && !d.events.some((e) => e.kind === 'sent' && e.at > lastAddendum.createdAt && (e.detail as { mail?: string }).mail === 'addendum')

  return (
    <div className="px-4 pb-28 pt-4">
      <Link href="/app/subs" className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm text-[var(--color-charcoal-light)]">
        <ArrowLeft className="size-4" aria-hidden="true" /> Subs and bids
      </Link>
      <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-[var(--color-gold-accessible)]">{pkg.trade}</p>
      <h1 className="text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
        {pkg.title}
      </h1>
      <p className="text-sm text-[var(--color-charcoal-light)]">{d.job.address || d.job.name}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip tone={STATUS_CHIP[pkg.status].tone}>{STATUS_CHIP[pkg.status].label}</Chip>
        {pkg.dueAt ? <Chip tone="quiet">Due {stamp(pkg.dueAt)}</Chip> : null}
        {lvSheet.budgetCents ? <Chip tone="quiet">Our cost {usd(lvSheet.budgetCents, { whole: true })}</Chip> : null}
      </div>

      {/* What to do next. */}
      {d.can.manage ? (
        <div className="mt-4 space-y-2">
          {pkg.status === 'draft' || unsent ? (
            <Button variant="primary" full disabled={!d.invites.length || !pkg.lines.length} onClick={() => setSheet('invite-mail')}>
              <Send className="size-4" aria-hidden="true" /> {pkg.status === 'draft' ? 'Send the invites' : `Send to the ${unsent} not sent yet`}
            </Button>
          ) : null}
          {pkg.status === 'draft' && (!d.invites.length || !pkg.lines.length) ? (
            <p className="text-xs text-[var(--color-charcoal-light)]">{!pkg.lines.length ? 'Add the lines to price, then who to ask.' : 'Add who to ask.'}</p>
          ) : null}
          {addendumUnsent && pkg.status === 'out' ? (
            <Button variant="primary" full onClick={() => setSheet('addendum-mail')}>
              <Send className="size-4" aria-hidden="true" /> Tell the subs about addendum {lastAddendum.n}
            </Button>
          ) : null}
          {pkg.status === 'awarded' && notChosen ? (
            <Button full onClick={() => setSheet('thanks-mail')}>
              <Send className="size-4" aria-hidden="true" /> Thank the {notChosen} not chosen
            </Button>
          ) : null}
          {shortBids && pkg.status !== 'awarded' ? (
            <p className="rounded-xl bg-[rgba(212,175,55,0.15)] px-3 py-2 text-xs text-[var(--color-charcoal)]">
              Company policies want {d.minBids} bids on a package this size; {d.invites.length} {d.invites.length === 1 ? 'is' : 'are'} asked.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Frozen Work Order / Subcontract (S7) and Award / Thank-you Drafts (S6). */}
      {d.workOrder ? (
        <>
          <SectionTitle>Work order & subcontract (SOP-008)</SectionTitle>
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-gold-accessible)]">
                  {d.workOrder.woNumber} · Frozen Work Order
                </p>
                <p className="text-base font-semibold text-[var(--color-charcoal)]">{d.workOrder.subName}</p>
                <p className="text-xs text-[var(--color-charcoal-light)]">
                  ROC {d.workOrder.rocLicense} · Bid Rev {d.workOrder.bidRevision} signed by {d.workOrder.signerName}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg font-semibold text-[var(--color-charcoal)]">{usd(d.workOrder.headlineCents)}</p>
                <Chip tone={d.workOrder.mobilizationGate.canMobilize ? 'ok' : 'warn'}>
                  {d.workOrder.mobilizationGate.canMobilize ? 'Cleared to mobilize' : 'Hold before mobilization'}
                </Chip>
              </div>
            </div>

            {!d.workOrder.mobilizationGate.canMobilize ? (
              <div className="mt-3 rounded-xl border border-[#8f6c18]/40 bg-[rgba(212,175,55,0.12)] px-3 py-2 text-xs text-[var(--color-charcoal)]">
                <span className="font-medium">Pre-mobilization gate (SOP-008):</span> Nobody mobilizes on site before{' '}
                {d.workOrder.mobilizationGate.blockers.join(', ')}.
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 rounded-xl bg-[var(--color-cream)] px-3 py-2.5 text-xs text-[var(--color-charcoal)] md:grid-cols-2">
              <div>
                <span className="font-medium">Job site:</span> {d.workOrder.jobAddress || d.workOrder.jobName}
              </div>
              <div>
                <span className="font-medium">Schedule window:</span>{' '}
                {d.workOrder.workFrom || d.workOrder.workTo
                  ? `${d.workOrder.workFrom ?? 'TBD'} → ${d.workOrder.workTo ?? 'TBD'}`
                  : d.workOrder.startOn
                    ? `Starts ${shortDay(d.workOrder.startOn)} (${d.workOrder.duration || 'per schedule'})`
                    : 'Per job schedule'}
              </div>
              <div>
                <span className="font-medium">Retainage & waivers:</span> {d.workOrder.retainagePct}% retainage · {d.workOrder.waiverRule}
              </div>
              <div>
                <span className="font-medium">Insurance rule:</span> {d.workOrder.coiRule}
              </div>
            </div>

            <ul className="mt-3 divide-y divide-[var(--color-stone)] text-xs text-[var(--color-charcoal)]">
              {d.workOrder.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-3 py-1.5">
                  <span>
                    {l.description}
                    {l.qty !== null ? ` · ${l.qty} ${l.unit}` : ''}
                  </span>
                  <span className="font-mono">{l.subCents !== null ? usd(l.subCents) : 'Excluded'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 font-mono text-[10px] text-[var(--color-charcoal-light)]">
              WO Hash {d.workOrder.workOrderHash.slice(0, 16)} · Bid Fingerprint {d.workOrder.bidFingerprint.slice(0, 16)}
            </p>
          </Card>

          {d.emailDrafts && (d.emailDrafts.awardDraft || d.emailDrafts.thankYouDrafts.length > 0) ? (
            <Card className="mt-3 space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">
                  Award & thank-you email drafts (review before sending)
                </p>
                <Chip tone="quiet">Never auto-sent</Chip>
              </div>
              {d.emailDrafts.awardDraft ? (
                <div className="rounded-xl border border-[var(--color-stone)] bg-white p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--color-charcoal)]">
                      Award notice → {d.emailDrafts.awardDraft.subName} ({d.emailDrafts.awardDraft.to})
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium text-[var(--color-teal)]"
                      onClick={() => {
                        const draft = d.emailDrafts!.awardDraft!
                        void navigator.clipboard?.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
                        toast('Award email draft copied for review.', 'ok')
                      }}
                    >
                      <Copy className="size-3.5" aria-hidden="true" /> Copy draft
                    </button>
                  </div>
                  <p className="mt-1 font-medium text-[var(--color-charcoal)]">{d.emailDrafts.awardDraft.subject}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[var(--color-charcoal-light)]">{d.emailDrafts.awardDraft.body}</p>
                </div>
              ) : null}
              {d.emailDrafts.thankYouDrafts.map((ty) => (
                <div key={ty.inviteId} className="rounded-xl border border-[var(--color-stone)] bg-white p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--color-charcoal)]">
                      Thank-you draft → {ty.subName} ({ty.to})
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium text-[var(--color-teal)]"
                      onClick={() => {
                        void navigator.clipboard?.writeText(`Subject: ${ty.subject}\n\n${ty.body}`)
                        toast(`Thank-you draft for ${ty.subName} copied.`, 'ok')
                      }}
                    >
                      <Copy className="size-3.5" aria-hidden="true" /> Copy draft
                    </button>
                  </div>
                  <p className="mt-1 font-medium text-[var(--color-charcoal)]">{ty.subject}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[var(--color-charcoal-light)]">{ty.body}</p>
                </div>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {/* The leveling sheet. */}
      <SectionTitle count={bids.length}>Bids, leveled</SectionTitle>
      {!bids.length ? (
        <Empty>{pkg.status === 'draft' ? 'Nothing out yet.' : 'No bids back yet.'}</Empty>
      ) : (
        <div className="space-y-3">
          {lvSheet.linesWithoutCost.length ? (
            <p className="text-xs text-[var(--color-charcoal-light)]">
              {lvSheet.linesWithoutCost.length} {lvSheet.linesWithoutCost.length === 1 ? 'line has' : 'lines have'} no cost of ours, so a gap there cannot be filled. Add our cost in the package.
            </p>
          ) : null}
          {ranked.map((i) => {
            const lv = lvSheet.bids.find((x) => x.inviteId === i.id)!
            const r = i.latest!
            const best = lvSheet.lowestLeveled === i.id
            const show = open === i.id
            return (
              <Card key={i.id} className={`p-4 ${best ? 'ring-2 ring-[var(--color-teal)]' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-charcoal)]">
                      {lv.rank}. {i.sub.name}
                    </p>
                    <p className="text-[11px] text-[var(--color-charcoal-light)]">
                      Revision {r.revision}, {stamp(r.submittedAt)}, signed by {r.signerName}
                      {r.signerTitle ? `, ${r.signerTitle}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-base text-[var(--color-charcoal)]">{usd(lv.leveledCents)}</p>
                    <p className="text-[11px] text-[var(--color-charcoal-light)]">leveled</p>
                  </div>
                </div>
                <div className="mt-2 space-y-0.5 rounded-xl bg-[var(--color-cream)] px-3 py-2 text-[13px] text-[var(--color-charcoal)]">
                  <div className="flex justify-between">
                    <span>Their total</span>
                    <span className="font-mono">{usd(lv.headlineCents)}</span>
                  </div>
                  {lv.pluggedCents ? (
                    <div className="flex justify-between">
                      <span>Our cost for {lv.plugs.length} left out</span>
                      <span className="font-mono">+{usd(lv.pluggedCents)}</span>
                    </div>
                  ) : null}
                  {lv.addCents ? (
                    <div className="flex justify-between">
                      <span>Added: {i.levelNote || 'their exclusions'}</span>
                      <span className="font-mono">
                        {lv.addCents > 0 ? '+' : ''}
                        {usd(lv.addCents)}
                      </span>
                    </div>
                  ) : null}
                  {lv.unpriced.length ? <p className="text-[11px] text-[#9a2a1f]">Leaves out {lv.unpriced.length} we have no cost for</p> : null}
                  {lvSheet.budgetCents ? (
                    <div className="flex justify-between text-[11px] text-[var(--color-charcoal-light)]">
                      <span>Against our cost</span>
                      <span className="font-mono">
                        {lv.leveledCents - lvSheet.budgetCents > 0 ? '+' : ''}
                        {usd(lv.leveledCents - lvSheet.budgetCents)}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {best ? <Chip tone="ok">Lowest leveled</Chip> : null}
                  {lvSheet.lowestHeadline === i.id && !best ? <Chip tone="warn">Lowest total, not lowest leveled</Chip> : null}
                  {i.status === 'awarded' ? <Chip tone="ok">Awarded</Chip> : null}
                  {i.sub.status !== 'approved' ? <Chip tone="warn">Not approved</Chip> : null}
                  {!i.readiness.ready ? <Chip tone="quiet">{i.readiness.missing.length} before they start</Chip> : null}
                  {r.startOn ? <Chip tone="quiet">Can start {shortDay(r.startOn)}</Chip> : null}
                  {r.duration ? <Chip tone="quiet">{r.duration}</Chip> : null}
                  <Chip tone="quiet">Good {r.validDays} days</Chip>
                </div>
                <button type="button" onClick={() => setOpen(show ? null : i.id)} className="mt-2 text-xs font-medium text-[var(--color-teal)]">
                  {show ? 'Less' : 'Line by line, and what they said'}
                </button>
                {show ? (
                  <div className="mt-2 space-y-2 text-[13px] text-[var(--color-charcoal)]">
                    <ul className="divide-y divide-[var(--color-stone)]">
                      {pkg.lines.map((l) => {
                        const x = r.lines.find((y) => y.lineId === l.id)
                        return (
                          <li key={l.id} className="flex justify-between gap-3 py-1">
                            <span>{l.description}</span>
                            {x && x.cents !== null ? (
                              <span className="font-mono">{usd(x.cents)}</span>
                            ) : (
                              <span className="text-right text-[#8f6c18]">{l.ourCents !== null ? `left out: our ${usd(l.ourCents)}` : 'left out'}</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    {r.lines.filter((x) => !pkg.lines.some((l) => l.id === x.lineId) && x.cents !== null).map((x) => (
                      <p key={x.lineId} className="text-[11px] text-[var(--color-charcoal-light)]">
                        Priced {usd(x.cents!)} on {lineName(x.lineId)}
                      </p>
                    ))}
                    {r.inclusions ? <p><span className="font-medium">Includes:</span> {r.inclusions}</p> : null}
                    {r.exclusions ? <p><span className="font-medium">Leaves out:</span> {r.exclusions}</p> : null}
                    {r.deviations ? <p className="text-[#9a2a1f]"><span className="font-medium">Takes exception:</span> {r.deviations}</p> : null}
                    {r.note ? <p><span className="font-medium">Note:</span> {r.note}</p> : null}
                    {r.files.map((f) => (
                      <a key={f.id} href={`/api/bids/${id}/download?fileId=${f.id}`} className="flex items-center gap-2 text-[var(--color-teal)]">
                        <FileDown className="size-4" aria-hidden="true" /> {f.name}
                      </a>
                    ))}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.signature.image} alt={`Signature of ${r.signerName}`} className="h-12 w-auto" />
                    <p className="font-mono text-[10px] text-[var(--color-charcoal-light)]">Fingerprint {r.fingerprint.slice(0, 16)}</p>
                    {d.can.manage && pkg.status !== 'awarded' ? (
                      levelEdit?.inviteId === i.id ? (
                        <div className="space-y-2 rounded-xl border border-[var(--color-stone)] p-3">
                          <p className="text-xs text-[var(--color-charcoal)]">What it would cost us to cover what they leave out or take exception to (a negative amount takes off).</p>
                          <input className={INPUT} inputMode="decimal" aria-label="Amount" value={levelEdit.amount} onChange={(e) => setLevelEdit({ ...levelEdit, amount: e.target.value })} />
                          <input className={INPUT} placeholder="Why: no haul-off, no permit" aria-label="Why" value={levelEdit.note} onChange={(e) => setLevelEdit({ ...levelEdit, note: e.target.value })} />
                          <div className="grid grid-cols-2 gap-2">
                            <Button onClick={() => setLevelEdit(null)}>Cancel</Button>
                            <Button variant="primary" busy={busy === 'level'} onClick={() => void saveLevel()}>
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button className="!min-h-10 !px-3 text-[13px]" onClick={() => setLevelEdit({ inviteId: i.id, amount: (i.levelAddCents / 100).toFixed(2), note: i.levelNote })}>
                          Add for their exclusions
                        </Button>
                      )
                    ) : null}
                  </div>
                ) : null}
                {i.award && pkg.status !== 'awarded' ? (
                  i.award.ok ? (
                    <Button
                      variant={best ? 'primary' : 'secondary'}
                      full
                      className="mt-3"
                      onClick={() => {
                        setAwarding({ inviteId: i.id, sub: i.sub.name, leveledCents: lv.leveledCents, headlineCents: lv.headlineCents, warnings: (i.award as { warnings: string[] }).warnings })
                        setSheet('award')
                      }}
                    >
                      <Trophy className="size-4" aria-hidden="true" /> Award to {i.sub.name}
                    </Button>
                  ) : (
                    <p className="mt-3 text-xs text-[var(--color-charcoal-light)]">{i.award.reason}</p>
                  )
                ) : null}
              </Card>
            )
          })}
        </div>
      )}

      {/* Who is asked. */}
      <SectionTitle
        count={d.invites.length}
        action={
          editable ? (
            <Button variant="quiet" className="!min-h-9 !px-2 text-[13px]" onClick={() => setSheet('invite')}>
              <UserPlus className="size-4" aria-hidden="true" /> Add
            </Button>
          ) : undefined
        }
      >
        Asked to bid
      </SectionTitle>
      {!d.invites.length ? (
        <Empty>Nobody yet. Pick subs from the directory.</Empty>
      ) : (
        <Card className="divide-y divide-[var(--color-stone)]">
          {d.invites.map((i) => {
            const chip = INVITE_CHIP[i.status] ?? INVITE_CHIP.invited
            return (
              <div key={i.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--color-charcoal)]">{i.sub.name}</p>
                    <p className="truncate text-[11px] text-[var(--color-charcoal-light)]">
                      {i.contactName ? `${i.contactName}, ` : ''}
                      {i.contactEmail}
                    </p>
                  </div>
                  <Chip tone={chip.tone}>{i.status === 'submitted' && i.revisions > 1 ? `Bid in (${i.revisions})` : chip.label}</Chip>
                </div>
                <p className="mt-1 text-[11px] text-[var(--color-charcoal-light)]">
                  {i.sentAt ? `Sent ${shortDay(i.sentAt)}` : 'Not sent yet'}
                  {i.viewedAt ? ` · opened ${shortDay(i.viewedAt)}` : i.sentAt ? ' · not opened' : ''}
                  {i.declineNote ? ` · "${i.declineNote}"` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
                  <a href={`/b/${i.token}?copy=1`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--color-teal)]">
                    <ExternalLink className="size-3.5" aria-hidden="true" /> Open as the sub
                  </a>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[var(--color-teal)]"
                    onClick={() => {
                      void navigator.clipboard?.writeText(`${window.location.origin}/b/${i.token}`)
                      toast('Link copied. It is theirs: send it only to them.', 'ok')
                    }}
                  >
                    <Copy className="size-3.5" aria-hidden="true" /> Copy their link
                  </button>
                  {editable && i.status !== 'awarded' ? (
                    <button type="button" className="text-[var(--color-charcoal-light)]" onClick={() => void withdraw(i.id)}>
                      Withdraw
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {/* The package itself. */}
      <SectionTitle
        action={
          editable ? (
            <Button variant="quiet" className="!min-h-9 !px-2 text-[13px]" onClick={() => setSheet('edit')}>
              <Pencil className="size-4" aria-hidden="true" /> Change
            </Button>
          ) : undefined
        }
      >
        The package
      </SectionTitle>
      <Card className="p-4">
        {pkg.scope ? <p className="whitespace-pre-wrap text-sm text-[var(--color-charcoal)]">{pkg.scope}</p> : <p className="text-sm text-[var(--color-charcoal-light)]">No scope words yet.</p>}
        <ul className="mt-3 divide-y divide-[var(--color-stone)]">
          {pkg.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 py-1.5 text-[13px] text-[var(--color-charcoal)]">
              <span>
                {l.description}
                {l.qty !== null ? <span className="text-[var(--color-charcoal-light)]"> · {l.qty.toLocaleString('en-US')} {l.unit}</span> : null}
              </span>
              <span className="shrink-0 font-mono text-[var(--color-charcoal-light)]">{l.ourCents !== null ? usd(l.ourCents, { whole: true }) : 'no cost'}</span>
            </li>
          ))}
        </ul>
        {pkg.exclusions.length ? <p className="mt-2 text-xs text-[var(--color-charcoal-light)]">Not in it: {pkg.exclusions.join('; ')}</p> : null}
        {pkg.siteWalk ? <p className="mt-1 text-xs text-[var(--color-charcoal-light)]">Site walk: {pkg.siteWalk}</p> : null}
        {d.addenda.length ? (
          <div className="mt-3 space-y-1">
            {d.addenda.map((a) => (
              <p key={a.n} className="text-xs text-[var(--color-charcoal)]">
                <span className="font-medium">Addendum {a.n}</span> ({shortDay(a.createdAt)}): {a.text}
              </p>
            ))}
          </div>
        ) : null}
        <div className="mt-3 space-y-1.5 border-t border-[var(--color-stone)] pt-3">
          {pkg.files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-[13px]">
              <a href={`/api/bids/${id}/download?fileId=${f.id}`} className="flex min-w-0 items-center gap-2 text-[var(--color-teal)]">
                <FileDown className="size-4 shrink-0" aria-hidden="true" /> <span className="truncate">{f.name}</span>
              </a>
              {editable ? (
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => void removeFile(f.id)} className="ml-auto p-1 text-[var(--color-charcoal-light)]">
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
          {editable ? (
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-[13px] font-medium text-[var(--color-teal)]">
              <Paperclip className="size-4" aria-hidden="true" /> {busy === 'upload' ? 'Uploading…' : 'Add plans or documents'}
              <input type="file" className="sr-only" multiple disabled={busy === 'upload'} onChange={(e) => void upload(e.target.files)} />
            </label>
          ) : null}
        </div>
      </Card>

      {d.can.manage ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {pkg.status === 'out' ? (
            <Button busy={busy === 'closed'} onClick={() => status('closed')}>
              Close bidding
            </Button>
          ) : null}
          {pkg.status === 'closed' ? (
            <Button busy={busy === 'out'} onClick={() => status('out')}>
              Reopen bidding
            </Button>
          ) : null}
          {pkg.status !== 'awarded' && pkg.status !== 'cancelled' ? (
            <Button variant="quiet" busy={busy === 'cancelled'} onClick={() => status('cancelled')}>
              Cancel the package
            </Button>
          ) : null}
        </div>
      ) : null}

      <SectionTitle>History</SectionTitle>
      <Card className="divide-y divide-[var(--color-stone)]">
        {d.events.slice(0, 60).map((e) => {
          const sub = e.inviteId ? d.invites.find((i) => i.id === e.inviteId)?.sub.name : ''
          const det = e.detail as { revision?: number; totalCents?: number; file?: string; n?: number; text?: string; sub?: string; note?: string }
          const extra = e.kind === 'submitted' ? ` (rev ${det.revision}, ${usd(det.totalCents ?? 0)})` : e.kind === 'downloaded' ? `: ${det.file}` : e.kind === 'addendum' ? ` ${det.n}` : e.kind === 'note' ? `: ${det.text}` : e.kind === 'declined' && det.note ? `: ${det.note}` : ''
          return (
            <div key={e.id} className="px-4 py-2 text-[13px]">
              <p className="text-[var(--color-charcoal)]">
                {EVENT_TEXT[e.kind] ?? e.kind}
                {sub ? ` · ${sub}` : ''}
                {extra}
              </p>
              <p className="text-[11px] text-[var(--color-charcoal-light)]">
                {stamp(e.at)} · {e.actor}
              </p>
            </div>
          )
        })}
      </Card>

      <PackageEditor open={sheet === 'edit'} pkg={pkg} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); void load() }} toast={toast} />
      <InviteSheet open={sheet === 'invite'} pkg={pkg} invited={d.invites.map((i) => i.subId)} onClose={() => setSheet(null)} onDone={() => { setSheet(null); void load() }} onNewSub={() => setSheet('newsub')} toast={toast} />
      <SubSheet open={sheet === 'newsub'} sub={null} presetTrade={pkg.trade} onClose={() => setSheet('invite')} onSaved={() => setSheet('invite')} toast={toast} />
      {(['invite', 'addendum', 'thanks'] as const).map((k) => (
        <MailSheet key={k} open={sheet === `${k}-mail`} pkgId={id} kind={k} onClose={() => setSheet(null)} onSent={() => { setSheet(null); void load() }} toast={toast} />
      ))}
      <AwardBidSheet open={sheet === 'award'} pkgId={id} bid={awarding} onClose={() => setSheet(null)} onDone={() => { setSheet(null); void load() }} toast={toast} />
    </div>
  )
}
