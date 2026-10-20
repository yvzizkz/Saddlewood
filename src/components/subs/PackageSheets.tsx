'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'

import { botApi } from '@/components/bot/BotProvider'
import { Button, Chip, Field, INPUT } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { usd } from '@/components/sales/format'
import { readiness } from '@/lib/subs/rules'
import { SUB_STATUS_LABEL, type BidPackage, type PackageLine, type Sub } from '@/lib/subs/types'

// The sheets of a package screen: change the package (an addendum once it is
// out), pick who to invite, write and preview the mail, and confirm an award.

type Toast = (m: string, t?: 'ok' | 'bad') => void

function phoenixLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(Date.parse(iso) - 7 * 3600_000)
  return d.toISOString().slice(0, 16)
}

function fromPhoenixLocal(v: string): string | null {
  return v ? new Date(`${v}:00-07:00`).toISOString() : null
}

function money(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2)
}

function cents(v: string): number | null {
  const n = Number(v.replace(/[$,\s]/g, ''))
  return v.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

// ---- edit ------------------------------------------------------------------------

export function PackageEditor({ open, pkg, onClose, onSaved, toast }: { open: boolean; pkg: BidPackage; onClose: () => void; onSaved: () => void; toast: Toast }) {
  const [f, setF] = useState(pkg)
  const [lines, setLines] = useState<(PackageLine & { cost: string })[]>([])
  const [excl, setExcl] = useState('')
  const [addendum, setAddendum] = useState('')
  const [busy, setBusy] = useState(false)
  const isOut = pkg.status !== 'draft'

  useEffect(() => {
    if (!open) return
    setF(pkg)
    setLines(pkg.lines.map((l) => ({ ...l, cost: money(l.ourCents) })))
    setExcl(pkg.exclusions.join('\n'))
    setAddendum('')
  }, [open, pkg])

  const set = (patch: Partial<BidPackage>) => setF((x) => ({ ...x, ...patch }))
  const setLine = (i: number, patch: Partial<PackageLine & { cost: string }>) => setLines((x) => x.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  async function save() {
    setBusy(true)
    try {
      await botApi(`/api/bids/${pkg.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          package: {
            jobId: pkg.jobId,
            opportunityId: pkg.opportunityId,
            trade: f.trade,
            title: f.title,
            scope: f.scope,
            lines: lines.map(({ cost, ...l }) => ({ ...l, qty: l.qty === null || Number.isNaN(Number(l.qty)) ? null : Number(l.qty), ourCents: cents(cost) })),
            exclusions: excl.split('\n').map((x) => x.trim()).filter(Boolean),
            workFrom: f.workFrom,
            workTo: f.workTo,
            siteWalk: f.siteWalk,
            dueAt: f.dueAt,
            terms: f.terms,
          },
          addendum,
        }),
      })
      toast(addendum.trim() ? 'Saved, with the addendum' : 'Saved', 'ok')
      onSaved()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="The package" maxHeightDvh={94}>
      <div className="space-y-4 px-5 pb-6 pt-4">
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <Field label="Trade">
            <input className={INPUT} value={f.trade} onChange={(e) => set({ trade: e.target.value })} />
          </Field>
          <Field label="Title">
            <input className={INPUT} value={f.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </div>
        <Field label="Scope" hint="What the work is, in words: the plan sheets, the spec sections, the conditions on site.">
          <textarea className={INPUT} rows={5} value={f.scope} onChange={(e) => set({ scope: e.target.value })} />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">Lines the subs price</p>
          <p className="mb-2 text-[11px] text-[var(--color-charcoal-light)]">Our cost is ours alone: it fills a gap in a bid on the leveling sheet and is never sent.</p>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={l.id || `n${i}`} className="rounded-xl border border-[var(--color-stone)] p-3">
                <div className="flex gap-2">
                  <input className={INPUT} placeholder="What to price" aria-label="Line" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  <button type="button" aria-label="Remove line" onClick={() => setLines((x) => x.filter((_, j) => j !== i))} className="p-2 text-[var(--color-charcoal-light)]">
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <input className={INPUT} inputMode="decimal" placeholder="Qty" aria-label="Quantity" value={l.qty ?? ''} onChange={(e) => setLine(i, { qty: e.target.value === '' ? null : (e.target.value as unknown as number) })} />
                  <input className={INPUT} placeholder="Unit" aria-label="Unit" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                  <input className={INPUT} inputMode="decimal" placeholder="Our cost" aria-label="Our cost" value={l.cost} onChange={(e) => setLine(i, { cost: e.target.value })} />
                </div>
                <input className={`${INPUT} mt-2`} placeholder="Note for the sub (optional)" aria-label="Note" value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} />
              </div>
            ))}
          </div>
          <Button variant="quiet" className="mt-1 !px-0" onClick={() => setLines((x) => [...x, { id: '', description: '', qty: null, unit: '', note: '', ourCents: null, cost: '' }])}>
            <Plus className="size-4" aria-hidden="true" /> Another line
          </Button>
        </div>
        <Field label="Not in this package" hint="One per line.">
          <textarea className={INPUT} rows={3} value={excl} onChange={(e) => setExcl(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Work from">
            <input type="date" className={INPUT} value={f.workFrom ?? ''} onChange={(e) => set({ workFrom: e.target.value || null })} />
          </Field>
          <Field label="Work to">
            <input type="date" className={INPUT} value={f.workTo ?? ''} onChange={(e) => set({ workTo: e.target.value || null })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bids due (Phoenix)">
            <input type="datetime-local" className={INPUT} value={phoenixLocal(f.dueAt)} onChange={(e) => set({ dueAt: fromPhoenixLocal(e.target.value) })} />
          </Field>
          <Field label="Site walk">
            <input className={INPUT} placeholder="Tue 10/28, 9 AM" value={f.siteWalk} onChange={(e) => set({ siteWalk: e.target.value })} />
          </Field>
        </div>
        <Field label="Our terms" hint="What every bid is priced against.">
          <textarea className={INPUT} rows={3} value={f.terms} onChange={(e) => set({ terms: e.target.value })} />
        </Field>
        {isOut ? (
          <Field label="Addendum" hint="The subs already have this package. Say what changed; every invitee sees it on their link.">
            <textarea className={INPUT} rows={3} value={addendum} onChange={(e) => setAddendum(e.target.value)} />
          </Field>
        ) : null}
        <Button variant="primary" full busy={busy} onClick={save}>
          Save
        </Button>
      </div>
    </BottomSheet>
  )
}

// ---- invite ----------------------------------------------------------------------

export function InviteSheet({ open, pkg, invited, onClose, onDone, onNewSub, toast }: { open: boolean; pkg: BidPackage; invited: string[]; onClose: () => void; onDone: () => void; onNewSub: () => void; toast: Toast }) {
  const [subs, setSubs] = useState<Sub[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (!open) return
    setPicked([])
    setAll(false)
    botApi<{ subs: Sub[] }>('/api/subs')
      .then((r) => setSubs(r.subs))
      .catch((e) => toast((e as Error).message, 'bad'))
  }, [open, toast])

  const list = useMemo(() => {
    const live = (subs ?? []).filter((s) => s.status !== 'inactive' && !invited.includes(s.id))
    const trade = pkg.trade.toLowerCase()
    const match = live.filter((s) => s.trades.some((t) => t === trade || t.includes(trade) || trade.includes(t)))
    return all ? live : match
  }, [subs, invited, pkg.trade, all])

  async function add() {
    setBusy(true)
    try {
      await botApi(`/api/bids/${pkg.id}/invites`, { method: 'POST', body: JSON.stringify({ add: picked.map((subId) => ({ subId })) }) })
      toast(`${picked.length} added. Send them the invite when you are ready.`, 'ok')
      onDone()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="Who bids this" maxHeightDvh={88}>
      <div className="space-y-3 px-5 pb-6 pt-4">
        <label className="flex items-center gap-2 text-sm text-[var(--color-charcoal)]">
          <input type="checkbox" className="size-5 accent-[var(--color-teal)]" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Show every trade, not only {pkg.trade}
        </label>
        {!subs ? (
          <div className="h-20 animate-pulse rounded-xl bg-[var(--color-cream)]" aria-busy="true" />
        ) : list.length === 0 ? (
          <p className="text-sm text-[var(--color-charcoal-light)]">Nobody {all ? '' : `for ${pkg.trade} `}in the directory yet.</p>
        ) : (
          list.map((s) => {
            const r = readiness(s, today)
            const to = (s.contacts.find((c) => c.isPrimary && c.email) ?? s.contacts.find((c) => c.email))?.email || s.email
            return (
              <label key={s.id} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-[var(--color-stone)] bg-white px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-[var(--color-charcoal)]">{s.name}</span>
                  <span className="block truncate text-[11px] text-[var(--color-charcoal-light)]">{to || 'no email yet: add one first'}</span>
                  <span className="mt-1 flex gap-1">
                    <Chip tone={s.status === 'approved' ? 'ok' : 'warn'}>{SUB_STATUS_LABEL[s.status]}</Chip>
                    {!r.ready ? <Chip tone="quiet">{r.missing.length} to finish</Chip> : null}
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-[var(--color-teal)]"
                  disabled={!to}
                  checked={picked.includes(s.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                />
              </label>
            )
          })
        )}
        <Button variant="quiet" className="!px-0" onClick={onNewSub}>
          <Plus className="size-4" aria-hidden="true" /> Add a sub to the directory
        </Button>
        <Button variant="primary" full busy={busy} disabled={!picked.length} onClick={add}>
          Add {picked.length || ''} to the package
        </Button>
      </div>
    </BottomSheet>
  )
}

// ---- mail ------------------------------------------------------------------------

type Preview = { messages: { inviteId: string; sub: string; to: string; unlisted: boolean; subject: string; text: string }[]; refused: { sub: string; address: string; reason: string }[] }

const MAIL_TITLE = { invite: 'Send the invites', addendum: 'Tell the subs what changed', thanks: 'Thank the others' } as const

export function MailSheet({ open, pkgId, kind, onClose, onSent, toast }: { open: boolean; pkgId: string; kind: 'invite' | 'addendum' | 'thanks'; onClose: () => void; onSent: () => void; toast: Toast }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [who, setWho] = useState<{ id: string; sub: string; to: string }[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPreview(null)
    setError('')
    botApi<{ subject: string; body: string; invites: { id: string; sub: string; to: string }[] }>(`/api/bids/${pkgId}/mail?kind=${kind}`)
      .then((r) => {
        setSubject(r.subject)
        setBody(r.body)
        setWho(r.invites)
      })
      .catch((e) => setError((e as Error).message))
  }, [open, pkgId, kind])

  async function go(send: boolean) {
    setBusy(send ? 'send' : 'preview')
    setError('')
    try {
      const r = await botApi<{ preview?: Preview; sent?: string[]; failed?: { sub: string; error: string }[] }>(`/api/bids/${pkgId}/mail`, {
        method: 'POST',
        body: JSON.stringify({ kind, subject, body, send, inviteIds: who.map((w) => w.id) }),
      })
      if (!send) setPreview(r.preview ?? null)
      else {
        toast(`Sent to ${r.sent?.length ?? 0}${r.failed?.length ? `; ${r.failed.length} did not go: ${r.failed[0].error}` : ''}`, r.failed?.length ? 'bad' : 'ok')
        onSent()
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <BottomSheet isOpen={open} onClose={onClose} title={MAIL_TITLE[kind]} maxHeightDvh={92}>
      <div className="space-y-4 px-5 pb-6 pt-4">
        {who.length ? (
          <p className="text-sm text-[var(--color-charcoal)]">
            One message each, to {who.length}: {who.map((w) => w.sub).join(', ')}.
          </p>
        ) : (
          <p className="text-sm text-[var(--color-charcoal-light)]">Nobody to send this to.</p>
        )}
        {!preview ? (
          <>
            <Field label="Subject">
              <input className={INPUT} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Message" hint={kind === 'thanks' ? '{first} becomes their first name.' : '{first} becomes their first name; {link} is their own button.'}>
              <textarea className={INPUT} rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            {error ? <p className="text-sm text-[#9a2a1f]">{error}</p> : null}
            <Button variant="primary" full busy={busy === 'preview'} disabled={!who.length} onClick={() => go(false)}>
              Preview
            </Button>
          </>
        ) : (
          <>
            {preview.messages.map((m) => (
              <div key={m.inviteId} className="rounded-xl border border-[var(--color-stone)] bg-white p-3">
                <p className="text-xs text-[var(--color-charcoal-light)]">
                  To {m.sub}: {m.to}
                </p>
                {m.unlisted ? <p className="mt-1 text-[11px] text-[#8f6c18]">Not on the owner&apos;s allowlist. It goes because a person is sending it; check the address.</p> : null}
                <p className="mt-2 text-sm font-medium text-[var(--color-charcoal)]">{m.subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-[var(--color-charcoal)] [overflow-wrap:anywhere]">{m.text}</p>
              </div>
            ))}
            {preview.refused.map((r) => (
              <p key={r.address} className="text-sm text-[#9a2a1f]">
                Not sent to {r.sub} ({r.address}): {r.reason}
              </p>
            ))}
            {error ? <p className="text-sm text-[#9a2a1f]">{error}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setPreview(null)}>Change it</Button>
              <Button variant="primary" busy={busy === 'send'} disabled={!preview.messages.length} onClick={() => go(true)}>
                Send {preview.messages.length}
              </Button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  )
}

// ---- award -----------------------------------------------------------------------

export function AwardBidSheet({ open, pkgId, bid, onClose, onDone, toast }: { open: boolean; pkgId: string; bid: { inviteId: string; sub: string; leveledCents: number; headlineCents: number; warnings: string[] } | null; onClose: () => void; onDone: () => void; toast: Toast }) {
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setWhy('')
  }, [open])
  if (!bid) return null
  async function award() {
    setBusy(true)
    try {
      await botApi(`/api/bids/${pkgId}/award`, { method: 'POST', body: JSON.stringify({ inviteId: bid!.inviteId, why }) })
      toast(`Awarded to ${bid!.sub}`, 'ok')
      onDone()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }
  return (
    <BottomSheet isOpen={open} onClose={onClose} title={`Award to ${bid.sub}`} maxHeightDvh={70} narrow>
      <div className="space-y-4 px-5 pb-6 pt-4">
        <p className="text-sm text-[var(--color-charcoal)]">
          Leveled {usd(bid.leveledCents)} (their total {usd(bid.headlineCents)}).
        </p>
        {bid.warnings.length ? (
          <div className="rounded-xl border border-[#8f6c18]/40 bg-[rgba(212,175,55,0.12)] px-3 py-2 text-sm text-[var(--color-charcoal)]">
            <p className="font-medium">You are passing over:</p>
            <ul className="mt-1 list-disc pl-5">
              {bid.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <Field label="Why this bid" hint="Kept with the award. Say it when it is not the lowest leveled.">
          <textarea className={INPUT} rows={3} value={why} onChange={(e) => setWhy(e.target.value)} />
        </Field>
        <p className="text-xs text-[var(--color-charcoal-light)]">The other bidders are not told until you send the thank-yous. Nobody starts before a signed work order and insurance on file (SOP-008).</p>
        <Button variant="primary" full busy={busy} onClick={award}>
          Award
        </Button>
      </div>
    </BottomSheet>
  )
}
