'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { CircleCheck, FileDown, Paperclip, X } from 'lucide-react'

import { SignaturePad, type PadValue } from '@/components/sales/SignaturePad'
import { SIGNATURE_FONT_KEYS } from '@/lib/sales/settings'
import { createClient } from '@/lib/supabase/client'
import type { BidLine, InviteStatus, PublicPackage } from '@/lib/subs/types'
import { usd } from '@/lib/money'

// The sub's side of a bid: the package as we sent it, and their bid. Prices
// per line (or "not included"), what they include and leave out, when they
// can start, how long the price holds, anything they take exception to,
// their quote attached, and a signature. They can send a new revision until
// the due time; every one is kept.

type Latest = {
  revision: number
  submittedAt: string
  totalCents: number
  lines: BidLine[]
  inclusions: string
  exclusions: string
  startOn: string | null
  duration: string
  validDays: number
  deviations: string
  note: string
  signerName: string
  signerTitle: string
  files: { name: string }[]
  missesAddenda: number[]
} | null

type Upload = { path: string; name: string; size: number; type: string }

const INPUT =
  'w-full rounded-xl border border-stone-mid bg-white px-3 py-2.5 text-base text-charcoal placeholder:text-[#9a938a] focus:border-teal focus:outline-none'


function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function day(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function centsOf(s: string): number | null {
  const n = Number(s.replace(/[$,\s]/g, ''))
  return s.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-stone px-5 py-5 sm:px-8">
      <p role="heading" aria-level={2} className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-accessible">
        {title}
      </p>
      {children}
    </section>
  )
}

const UPLOADABLE = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/csv',
  'application/zip',
]

export function BidForm({
  token,
  ownCopy,
  sub,
  pkg,
  status,
  declineNote,
  latest,
}: {
  token: string
  ownCopy: boolean
  sub: { name: string; contact: string }
  pkg: PublicPackage
  status: InviteStatus
  declineNote: string
  latest: Latest
}) {
  const start = latest
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(pkg.lines.map((l) => {
      const c = start?.lines.find((x) => x.lineId === l.id)?.cents
      return [l.id, c === null || c === undefined ? '' : (c / 100).toFixed(2)]
    })),
  )
  const [out, setOut] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(pkg.lines.map((l) => [l.id, !!start && (start.lines.find((x) => x.lineId === l.id)?.cents ?? null) === null])),
  )
  const [inclusions, setInclusions] = useState(start?.inclusions ?? '')
  const [exclusions, setExclusions] = useState(start?.exclusions ?? '')
  const [startOn, setStartOn] = useState(start?.startOn ?? '')
  const [duration, setDuration] = useState(start?.duration ?? '')
  const [validDays, setValidDays] = useState(String(start?.validDays ?? 30))
  const [deviations, setDeviations] = useState(start?.deviations ?? '')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<Upload[]>([])
  const [uploading, setUploading] = useState(false)
  const [signer, setSigner] = useState(start?.signerName ?? sub.contact)
  const [title, setTitle] = useState(start?.signerTitle ?? '')
  const [pad, setPad] = useState<PadValue>(null)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState<'send' | 'decline' | null>(null)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<{ revision: number; totalCents: number } | null>(null)
  const [declining, setDeclining] = useState(false)
  const [passNote, setPassNote] = useState('')
  const [passed, setPassed] = useState(status === 'declined')
  const [editing, setEditing] = useState(!latest)

  const total = useMemo(() => pkg.lines.reduce((s, l) => s + (out[l.id] ? 0 : (centsOf(prices[l.id] ?? '') ?? 0)), 0), [pkg.lines, prices, out])
  const missing = pkg.lines.filter((l) => !out[l.id] && centsOf(prices[l.id] ?? '') === null)
  const q = ownCopy ? '?copy=1' : ''

  async function attach(list: FileList | null) {
    if (!list?.length) return
    setUploading(true)
    setError('')
    try {
      for (const f of Array.from(list).slice(0, 10 - files.length)) {
        if (!UPLOADABLE.includes(f.type)) throw new Error(`${f.name}: send a PDF, a picture, a spreadsheet or a document`)
        const r = await fetch(`/b/${token}/upload`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: f.name, type: f.type, size: f.size }) })
        const slot = (await r.json()) as { ok: boolean; error?: string; bucket: string; path: string; token: string; file: Upload }
        if (!slot.ok) throw new Error(slot.error ?? 'the upload did not start')
        const { error: upErr } = await createClient().storage.from(slot.bucket).uploadToSignedUrl(slot.path, slot.token, f, { contentType: f.type })
        if (upErr) throw new Error(upErr.message)
        setFiles((x) => [...x, slot.file])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function send() {
    setError('')
    if (missing.length) return setError(`Price every line, or mark it not included: ${missing[0].description}`)
    if (!pad) return setError('Sign the bid')
    if (!agree) return setError('Tick the box to agree')
    setBusy('send')
    try {
      const r = await fetch(`/b/${token}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: pkg.lines.map((l) => ({ lineId: l.id, cents: out[l.id] ? null : centsOf(prices[l.id] ?? ''), note: '' })),
          inclusions,
          exclusions,
          startOn: startOn || null,
          duration,
          validDays: Math.max(1, Math.min(365, Math.round(Number(validDays) || 30))),
          deviations,
          note,
          files,
          signerTitle: title,
          signature: { ...pad, name: signer, agree: true },
        }),
      })
      const d = (await r.json()) as { ok: boolean; error?: string; revision: number; totalCents: number }
      if (!d.ok) throw new Error(d.error ?? 'the bid did not go through')
      setSent({ revision: d.revision, totalCents: d.totalCents })
      setEditing(false)
      setPad(null)
      setAgree(false)
      setFiles([])
      setNote('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function decline() {
    setBusy('decline')
    setError('')
    try {
      const r = await fetch(`/b/${token}/decline`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: passNote }) })
      const d = (await r.json()) as { ok: boolean; error?: string }
      if (!d.ok) throw new Error(d.error ?? 'that did not go through')
      setPassed(true)
      setDeclining(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const closedNote =
    status === 'awarded'
      ? 'This work was awarded to you. We will be in touch with the work order.'
      : status === 'not_awarded'
        ? 'This package was awarded. Thank you for bidding.'
        : !pkg.open
          ? 'This package is closed to bids.'
          : null

  return (
    <main className="min-h-screen bg-cream px-0 py-0 sm:px-4 sm:py-8">
      <article className="mx-auto max-w-3xl overflow-hidden bg-white sm:rounded-xl sm:border sm:border-stone sm:shadow-sm">
        <div className="relative bg-teal px-5 pb-7 pt-6 text-off-white sm:px-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-gold" aria-hidden="true" />
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-roundel.png" alt="" width={40} height={40} className="h-10 w-10 rounded-full ring-1 ring-gold/40" />
            <div>
              <p className="font-heading text-lg leading-tight">Saddlewood Contracting</p>
              <p className="text-[11px] opacity-70">ROC 305762 · Scottsdale, Arizona</p>
            </div>
          </div>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-champagne">Bid package · {pkg.trade}</p>
          <h1 className="mt-1 font-heading text-2xl leading-tight sm:text-3xl">{pkg.title}</h1>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-60">For</p>
              <p className="font-medium">{sub.name}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-60">Job</p>
              <p className="font-medium">{pkg.job.address || pkg.job.name}</p>
            </div>
            {pkg.dueAt ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] opacity-60">Bids due</p>
                <p className="font-medium">{when(pkg.dueAt)} (Phoenix)</p>
              </div>
            ) : null}
            {pkg.workFrom || pkg.workTo ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] opacity-60">Work window</p>
                <p className="font-medium">
                  {pkg.workFrom ? day(pkg.workFrom) : 'TBD'} to {pkg.workTo ? day(pkg.workTo) : 'TBD'}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {ownCopy ? <p className="bg-gold/20 px-5 py-2 text-center text-xs text-charcoal sm:px-8">Our own copy: opening it here is not counted as the sub.</p> : null}

        {pkg.addenda.length ? (
          <Section title="Addenda">
            <ol className="space-y-2">
              {pkg.addenda.map((a) => (
                <li key={a.n} className="rounded-xl border border-gold/50 bg-gold/10 px-3 py-2 text-sm text-charcoal">
                  <span className="font-semibold">Addendum {a.n}</span> <span className="text-xs text-charcoal-light">({when(a.createdAt)})</span>
                  <p className="mt-1 whitespace-pre-wrap">{a.text}</p>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {pkg.scope ? (
          <Section title="Scope">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-charcoal">{pkg.scope}</p>
          </Section>
        ) : null}

        {pkg.files.length ? (
          <Section title="Plans and documents">
            <ul className="space-y-2">
              {pkg.files.map((f) => (
                <li key={f.id}>
                  <a href={`/b/${token}/f/${f.id}${q}`} className="flex min-h-11 items-center gap-2 rounded-xl border border-stone px-3 text-sm text-teal">
                    <FileDown className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{f.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-charcoal-light">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {pkg.siteWalk || pkg.exclusions.length || pkg.terms ? (
          <Section title="Good to know">
            {pkg.siteWalk ? <p className="mb-2 text-sm text-charcoal"><span className="font-medium">Site walk:</span> {pkg.siteWalk}</p> : null}
            {pkg.exclusions.length ? (
              <>
                <p className="text-sm font-medium text-charcoal">Not in this package</p>
                <ul className="mb-2 mt-1 list-disc pl-5 text-sm text-charcoal">
                  {pkg.exclusions.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </>
            ) : null}
            {pkg.terms ? <p className="whitespace-pre-wrap text-sm text-charcoal-light">{pkg.terms}</p> : null}
          </Section>
        ) : null}

        {sent || (latest && !editing) ? (
          <Section title="Your bid">
            <div className="flex items-start gap-3 rounded-xl border border-teal/30 bg-teal/5 px-4 py-3">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden="true" />
              <div className="text-sm text-charcoal">
                <p className="font-medium">
                  {sent ? `Bid sent: revision ${sent.revision}, ${usd(sent.totalCents)}.` : `Revision ${latest!.revision}, ${usd(latest!.totalCents)}, sent ${when(latest!.submittedAt)} by ${latest!.signerName}.`}
                </p>
                <p className="mt-1 text-charcoal-light">We have it, signed and dated. You can send a revised bid until the due time.</p>
                {!sent && latest!.missesAddenda.length ? (
                  <p className="mt-1 font-medium text-[#9a2a1f]">Addend{latest!.missesAddenda.length === 1 ? 'um' : 'a'} {latest!.missesAddenda.join(', ')} came after this bid. Please look and send a revision if it changes your price.</p>
                ) : null}
              </div>
            </div>
            {pkg.open && status !== 'awarded' && status !== 'not_awarded' ? (
              <button type="button" onClick={() => { setEditing(true); setSent(null) }} className="mt-3 min-h-11 rounded-xl border border-stone-mid px-4 text-sm font-medium text-teal">
                Send a revised bid
              </button>
            ) : null}
          </Section>
        ) : null}

        {closedNote ? (
          <Section title="Status">
            <p className="text-sm text-charcoal">{closedNote}</p>
          </Section>
        ) : passed && !editing ? (
          <Section title="Your answer">
            <p className="text-sm text-charcoal">You passed on this one{declineNote || passNote ? `: ${declineNote || passNote}` : ''}. Thank you for letting us know. Changed your mind? You can still bid until the due time.</p>
            <button type="button" onClick={() => { setEditing(true); setPassed(false) }} className="mt-3 min-h-11 rounded-xl border border-stone-mid px-4 text-sm font-medium text-teal">
              Bid after all
            </button>
          </Section>
        ) : editing ? (
          <>
            <Section title={`Your prices${latest ? `: revision ${latest.revision + 1}` : ''}`}>
              <p className="mb-3 text-sm text-charcoal-light">Price each line, or mark it not included. The total is worked out for you.</p>
              <ul className="space-y-3">
                {pkg.lines.map((l) => (
                  <li key={l.id} className="rounded-xl border border-stone p-3">
                    <p className="text-sm font-medium text-charcoal">{l.description}</p>
                    {l.qty !== null || l.note ? (
                      <p className="mt-0.5 text-xs text-charcoal-light">
                        {l.qty !== null ? `${l.qty.toLocaleString('en-US')} ${l.unit}` : ''}
                        {l.qty !== null && l.note ? ' · ' : ''}
                        {l.note}
                      </p>
                    ) : null}
                    <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
                      <input
                        className={`${INPUT} ${out[l.id] ? 'opacity-40' : ''}`}
                        inputMode="decimal"
                        placeholder="$0.00"
                        aria-label={`Price for ${l.description}`}
                        disabled={out[l.id]}
                        value={prices[l.id] ?? ''}
                        onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))}
                      />
                      <label className="flex min-h-11 items-center gap-2 text-xs text-charcoal">
                        <input type="checkbox" className="size-5 accent-[var(--color-teal)]" checked={!!out[l.id]} onChange={(e) => setOut((o) => ({ ...o, [l.id]: e.target.checked }))} />
                        Not included
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-baseline justify-between rounded-xl bg-cream px-4 py-3">
                <span className="text-sm font-medium text-charcoal">Your total</span>
                <span className="font-mono text-lg text-charcoal">{usd(total)}</span>
              </div>
            </Section>

            <Section title="The rest of your bid">
              <div className="space-y-3">
                <label className="block text-sm text-charcoal">
                  What your price includes
                  <textarea className={`${INPUT} mt-1`} rows={3} value={inclusions} onChange={(e) => setInclusions(e.target.value)} />
                </label>
                <label className="block text-sm text-charcoal">
                  What it leaves out
                  <textarea className={`${INPUT} mt-1`} rows={3} value={exclusions} onChange={(e) => setExclusions(e.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm text-charcoal">
                    Can start
                    <input type="date" className={`${INPUT} mt-1`} value={startOn} onChange={(e) => setStartOn(e.target.value)} />
                  </label>
                  <label className="block text-sm text-charcoal">
                    How long it takes
                    <input className={`${INPUT} mt-1`} placeholder="3 weeks" value={duration} onChange={(e) => setDuration(e.target.value)} />
                  </label>
                </div>
                <label className="block text-sm text-charcoal">
                  Price good for (days)
                  <input className={`${INPUT} mt-1`} inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value)} />
                </label>
                <label className="block text-sm text-charcoal">
                  Anything in our terms you take exception to
                  <textarea className={`${INPUT} mt-1`} rows={2} value={deviations} onChange={(e) => setDeviations(e.target.value)} />
                </label>
                <label className="block text-sm text-charcoal">
                  A note to us
                  <textarea className={`${INPUT} mt-1`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <div>
                  <p className="text-sm text-charcoal">Your quote or backup (optional)</p>
                  <ul className="mt-1 space-y-1">
                    {files.map((f) => (
                      <li key={f.path} className="flex items-center gap-2 text-sm text-charcoal">
                        <Paperclip className="size-4" aria-hidden="true" /> <span className="truncate">{f.name}</span>
                        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((y) => y.path !== f.path))} className="ml-auto p-2 text-charcoal-light">
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-stone-mid px-4 text-sm font-medium text-teal">
                    <Paperclip className="size-4" aria-hidden="true" /> {uploading ? 'Uploading…' : 'Attach a file'}
                    <input type="file" className="sr-only" multiple disabled={uploading || files.length >= 10} onChange={(e) => void attach(e.target.files)} />
                  </label>
                </div>
              </div>
            </Section>

            <Section title="Sign and send">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-charcoal">
                  Your name
                  <input className={`${INPUT} mt-1`} value={signer} onChange={(e) => setSigner(e.target.value)} />
                </label>
                <label className="block text-sm text-charcoal">
                  Title
                  <input className={`${INPUT} mt-1`} placeholder="Owner, estimator" value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
              </div>
              <div className="mt-3">
                <SignaturePad name={signer} fonts={[...SIGNATURE_FONT_KEYS]} onChange={setPad} />
              </div>
              <label className="mt-3 flex items-start gap-3 text-sm text-charcoal">
                <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-teal)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                By signing, I submit this bid for the scope shown, at these prices, and I agree that this electronic signature is as binding as a handwritten one.
              </label>
              {error ? <p className="mt-3 text-sm font-medium text-[#9a2a1f]">{error}</p> : null}
              <button
                type="button"
                disabled={busy !== null || uploading || ownCopy}
                onClick={() => void send()}
                className="mt-4 min-h-12 w-full rounded-xl bg-teal px-4 text-base font-semibold text-off-white disabled:opacity-50"
              >
                {busy === 'send' ? 'Sending…' : `Send my bid: ${usd(total)}`}
              </button>
              {ownCopy ? <p className="mt-2 text-center text-xs text-charcoal-light">This is our own copy; only the sub can send from their link.</p> : null}
              {!latest && status === 'invited' ? (
                declining ? (
                  <div className="mt-4 space-y-2">
                    <textarea className={INPUT} rows={2} placeholder="Why, if you want to say (too busy, not our trade)" value={passNote} onChange={(e) => setPassNote(e.target.value)} />
                    <button type="button" disabled={busy !== null || ownCopy} onClick={() => void decline()} className="min-h-11 w-full rounded-xl border border-stone-mid text-sm font-medium text-charcoal">
                      {busy === 'decline' ? 'Sending…' : 'Pass on this one'}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDeclining(true)} className="mt-3 w-full text-center text-sm text-charcoal-light underline">
                    Not bidding this one?
                  </button>
                )
              ) : null}
            </Section>
          </>
        ) : null}
        <footer className="border-t border-stone px-5 py-4 text-center text-xs text-charcoal-light sm:px-8">Questions: reply to the email this link came in, or info@saddlewoodcontracting.com</footer>
      </article>
    </main>
  )
}
