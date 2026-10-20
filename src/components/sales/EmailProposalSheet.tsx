'use client'

import { useState } from 'react'
import { CheckCircle2, Copy, Link2, Paperclip, X } from 'lucide-react'

import { Button, Field, INPUT } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { fillTemplate } from '@/lib/sales/settings'
import type { Opportunity } from '@/lib/sales/types'
import { Toggle } from './builder/fields'

// Email an issued proposal from the app: the link, the PDF, or both. It always
// goes through a preview first, showing the exact sender, recipients, words
// and files, and only then offers Send (wording approved is not send
// approved). An outside address the owner has not allowed is refused by the
// server; the preview says which and shows the owner's command to allow it.

export type EmailDefaults = { subject: string; body: string; link: boolean; attachPdf: boolean; fromName: string; fromAddress: string }

type Preview = {
  from: string
  to: string[]
  cc: string[]
  /** Our own addresses get a separate copy whose link is never counted as the client's viewing. */
  staffCopyTo?: string[]
  subject: string
  text: string
  attachments?: { filename: string; bytes: number }[]
  refused?: { address: string; reason: string; addCommand?: string }[]
}

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/

function AddressList({ label, list, onChange }: { label: string; list: string[]; onChange: (l: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const a = draft.trim().toLowerCase().replace(/[,;]$/, '')
    if (!EMAIL.test(a) || list.includes(a)) return
    onChange([...list, a])
    setDraft('')
  }
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-[var(--color-stone-mid)] bg-white px-2 py-1.5">
        {list.map((a) => (
          <span key={a} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-[var(--color-cream)] pl-2.5 pr-1 text-[13px] text-[var(--color-charcoal)]">
            {a}
            <button type="button" aria-label={`Remove ${a}`} onClick={() => onChange(list.filter((x) => x !== a))} className="inline-flex size-7 items-center justify-center rounded-full">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
          inputMode="email"
          aria-label={`Add ${label.toLowerCase()} address`}
          placeholder={list.length ? '' : 'name@example.com'}
          className="min-w-[10rem] flex-1 bg-transparent px-1 py-1 text-base text-[var(--color-charcoal)] focus:outline-none"
        />
      </div>
    </Field>
  )
}

export function EmailProposalSheet({
  open,
  onClose,
  documentId,
  opportunity,
  proposalTitle,
  number,
  defaults,
  onSent,
}: {
  open: boolean
  onClose: () => void
  documentId: string
  opportunity: Opportunity
  proposalTitle: string
  number: string
  defaults: EmailDefaults
  onSent?: () => void
}) {
  const fill = (t: string) =>
    fillTemplate(t, {
      title: proposalTitle || opportunity.title,
      number,
      company: opportunity.contact.company?.trim() || opportunity.contact.name || '',
      first: (opportunity.contact.name ?? '').trim().split(/\s+/)[0] ?? '',
    })
  const [to, setTo] = useState<string[]>(opportunity.contact.email ? [opportunity.contact.email.toLowerCase()] : [])
  const [cc, setCc] = useState<string[]>([])
  const [subject, setSubject] = useState(() => fill(defaults.subject))
  const [body, setBody] = useState(() => fill(defaults.body))
  const [link, setLink] = useState(defaults.link || !defaults.attachPdf)
  const [attachPdf, setAttachPdf] = useState(defaults.attachPdf)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<null | 'preview' | 'send'>(null)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  // Any change after a preview means the preview no longer shows what would go out.
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPreview(null)
  }

  async function post(confirm: boolean) {
    setBusy(confirm ? 'send' : 'preview')
    setErr('')
    try {
      const res = await fetch(`/api/sales/proposals/${documentId}/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, cc, subject, body, link, attachPdf, ...(confirm ? { confirm: true } : {}) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        // A refusal may still carry the preview (which address, and why).
        if (j.preview || j.refused) setPreview({ from: j.from ?? '', to: j.to ?? to, cc: j.cc ?? cc, staffCopyTo: j.staffCopyTo ?? [], subject: j.subject ?? subject, text: j.text ?? '', attachments: j.attachments, refused: j.refused })
        throw new Error(j.error || `could not ${confirm ? 'send' : 'preview'} (${res.status})`)
      }
      if (confirm) {
        setSent(true)
        onSent?.()
      } else {
        setPreview(j as Preview)
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const refused = preview?.refused ?? []
  const canSend = !!preview && refused.length === 0 && to.length > 0

  return (
    <BottomSheet isOpen={open} onClose={onClose} title={sent ? 'Sent' : 'Email the proposal'} maxHeightDvh={94} narrow>
      {sent ? (
        <div className="space-y-4 px-5 pb-6 pt-4">
          <p className="flex items-start gap-2 rounded-xl bg-[rgba(47,107,74,0.12)] px-3 py-3 text-sm text-[#2f6b4a]">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            Sent to {to.join(', ')}. It is on the timeline, and the proof record shows when it is delivered and opened.
          </p>
          <Button variant="primary" full onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4 px-5 pb-6 pt-4 ph-no-capture">
          <AddressList label="To" list={to} onChange={touch(setTo)} />
          <AddressList label="Cc" list={cc} onChange={touch(setCc)} />
          <Field label="Subject">
            <input className={INPUT} value={subject} onChange={(e) => touch(setSubject)(e.target.value)} />
          </Field>
          <Field label="Message" hint={link ? '{link} is where the proposal button goes. Leave it in, or the button goes at the end.' : 'Only the PDF goes: no link button.'}>
            <textarea className={INPUT} rows={8} value={body} onChange={(e) => touch(setBody)(e.target.value)} />
          </Field>
          <div className="divide-y divide-[var(--color-stone)] rounded-xl border border-[var(--color-stone)] bg-white px-3">
            <Toggle
              on={link}
              onChange={(v) => {
                if (!v && !attachPdf) return
                touch(setLink)(v)
              }}
              label="Include the link"
              hint="The client opens it to choose options, accept and sign. Openings are recorded."
            />
            <Toggle
              on={attachPdf}
              onChange={(v) => {
                if (!v && !link) return
                touch(setAttachPdf)(v)
              }}
              label="Attach the PDF"
              hint="A copy they can file or print. Openings of an attachment cannot be recorded."
            />
          </div>

          {preview ? (
            <div className="space-y-2 rounded-2xl border border-[var(--color-stone)] bg-[var(--color-cream)] px-4 py-3 text-sm">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] font-mono text-[var(--color-gold-accessible)]">What will go out</p>
              <p>
                <span className="text-[var(--color-charcoal-light)]">From </span>
                {preview.from}
              </p>
              <p>
                <span className="text-[var(--color-charcoal-light)]">To </span>
                {preview.to.join(', ')}
                {preview.cc.length ? <span className="text-[var(--color-charcoal-light)]"> · Cc {preview.cc.join(', ')}</span> : null}
              </p>
              {preview.staffCopyTo?.length ? (
                <p className="text-[13px] text-[var(--color-charcoal-light)]">Our copy, with an uncounted link: {preview.staffCopyTo.join(', ')}</p>
              ) : null}
              <p className="font-medium">{preview.subject}</p>
              <p className="whitespace-pre-line break-words rounded-lg bg-white px-3 py-2 text-[13px] leading-relaxed">{preview.text}</p>
              {preview.attachments?.length ? (
                <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  {preview.attachments.map((a) => `${a.filename} (${Math.max(1, Math.round(a.bytes / 1024))} KB)`).join(', ')}
                </p>
              ) : link ? (
                <p className="flex items-center gap-1.5 text-[13px]">
                  <Link2 className="size-3.5" aria-hidden="true" /> Link only
                </p>
              ) : null}
              {refused.length ? (
                <div className="space-y-2 border-t border-[var(--color-stone-mid)] pt-2">
                  {refused.map((r) => (
                    <div key={r.address} className="rounded-lg bg-[rgba(154,42,31,0.08)] px-3 py-2 text-[13px] text-[#9a2a1f]">
                      <p>
                        <strong>{r.address}</strong>: {r.reason}
                      </p>
                      {r.addCommand ? (
                        <div className="mt-1.5 flex items-start gap-2">
                          <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-[11px] text-[var(--color-charcoal)]">{r.addCommand}</code>
                          <button
                            type="button"
                            aria-label="Copy the command"
                            onClick={() => navigator.clipboard?.writeText(r.addCommand!).catch(() => {})}
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]"
                          >
                            <Copy className="size-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <p className="text-[12px] text-[var(--color-charcoal-light)]">An owner allows an address with the command on the Mac; then preview again.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {err ? <p className="text-sm text-[#9a2a1f]">{err}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button busy={busy === 'preview'} disabled={to.length === 0 || !subject.trim() || !body.trim()} onClick={() => post(false)}>
              {preview ? 'Preview again' : 'Preview'}
            </Button>
            <Button variant="primary" busy={busy === 'send'} disabled={!canSend} onClick={() => post(true)}>
              Send
            </Button>
          </div>
          {!preview ? <p className="text-center text-[11px] text-[var(--color-charcoal-light)]">Preview first: Send opens once you have seen exactly what goes out.</p> : null}
        </div>
      )}
    </BottomSheet>
  )
}
