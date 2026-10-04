'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock, Lock, Paperclip, Send, X } from 'lucide-react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { useBot } from './BotProvider'
import { Button, Chip, INPUT } from './ui'
import { clock12, type BotDraft } from '@/lib/bot/types'
import { ago, canApprove, dayTime } from '@/lib/bot/view'

// Read the whole draft, then send it, time it, or kill it. Sending an email to
// someone outside the company cannot be undone, so "Approve & send" takes two
// taps: the second one names the recipient.

const FROM: Record<string, string> = {
  info: 'info@saddlewoodcontracting.com',
  marco: 'marco@saddlewoodcontracting.com',
  accounting: 'accounting@saddlewoodcontracting.com',
}

type Mode = 'idle' | 'confirm-send' | 'schedule' | 'confirm-cancel'

export default function DraftSheet({ draft, onClose }: { draft: BotDraft | null; onClose: () => void }) {
  const { home, act, busy } = useBot()
  const [mode, setMode] = useState<Mode>('idle')
  const [at, setAt] = useState('08:00')
  const revert = useRef<number | undefined>(undefined)

  // The parent keys this sheet by draft number, so each draft starts idle.
  useEffect(() => () => window.clearTimeout(revert.current), [])

  if (!draft) return null

  const me = home?.me.name ?? null
  const online = !!home?.bridge.online
  const key = `draft:${draft.n}`
  const working = !!busy[key]
  const mine = canApprove(draft, me)
  const mayTouch = !!me && draft.approvers.includes(me)

  function arm(next: Mode) {
    window.clearTimeout(revert.current)
    setMode(next)
    // An armed button that sits there is a button someone taps by accident.
    if (next === 'confirm-send' || next === 'confirm-cancel') {
      revert.current = window.setTimeout(() => setMode('idle'), 7000)
    }
  }

  async function run(input: Parameters<typeof act>[0]) {
    window.clearTimeout(revert.current)
    const res = await act(input, key)
    if (res.ok) onClose()
    else setMode('idle')
  }

  return (
    <BottomSheet isOpen narrow onClose={onClose} maxHeightDvh={92} ariaLabel={`Draft ${draft.n}: ${draft.subject}`}>
      <div className="ph-no-capture px-5 pb-6">
        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <Chip tone="ink">
                <span className="font-mono">#{draft.n}</span>
              </Chip>
              {draft.status === 'approved' && draft.sendAt ? <Chip tone="ok">Sending {dayTime(draft.sendAt)}</Chip> : null}
              {draft.status === 'scheduled' ? <Chip tone="ok">On a timer</Chip> : null}
              {draft.held ? (
                <Chip tone="bad">
                  <Lock className="size-3" aria-hidden="true" /> Held
                </Chip>
              ) : null}
            </div>
            <p role="heading" aria-level={2} className="text-lg leading-snug text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
              {draft.subject}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--color-charcoal-light)] active:bg-[var(--color-stone)]"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-[var(--color-charcoal-light)]">To</dt>
          <dd className="break-words font-medium text-[var(--color-charcoal)]">{draft.to}</dd>
          {draft.cc.length ? (
            <>
              <dt className="text-[var(--color-charcoal-light)]">Cc</dt>
              <dd className="break-words">{draft.cc.join(', ')}</dd>
            </>
          ) : null}
          <dt className="text-[var(--color-charcoal-light)]">From</dt>
          <dd className="break-words">{FROM[draft.sendAs] ?? FROM.info}</dd>
          {draft.attach.length ? (
            <>
              <dt className="text-[var(--color-charcoal-light)]">Files</dt>
              <dd className="flex flex-wrap gap-1.5">
                {draft.attach.map((a) => (
                  <Chip key={a}>
                    <Paperclip className="size-3" aria-hidden="true" /> {a}
                  </Chip>
                ))}
              </dd>
            </>
          ) : null}
          <dt className="text-[var(--color-charcoal-light)]">Asked</dt>
          <dd>
            {draft.requestedBy ? `${draft.requestedBy}, ` : ''}
            {ago(draft.created)}
          </dd>
        </dl>

        {/* A held draft's text never leaves the office Mac; there is nothing to show. */}
        {draft.body ? (
          <div className="mt-4 rounded-xl border border-[var(--color-stone)] bg-white p-4 text-[15px] leading-relaxed whitespace-pre-wrap text-[var(--color-charcoal)]">
            {draft.body}
          </div>
        ) : null}

        {draft.classReason ? (
          <p className="mt-3 text-xs text-[var(--color-charcoal-light)]">Why it waits for a person: {draft.classReason}.</p>
        ) : null}

        <div className="mt-5">
          {draft.held ? (
            <p className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'rgba(154,42,31,0.08)', color: '#7f1d1d' }}>
              This one is on the hold list (settlement, legal, or payment details). It is read and sent from the office
              keyboard, never from a phone, so its text is not shown here.
            </p>
          ) : draft.blocked ? (
            <div className="flex flex-col gap-2">
              <p className="rounded-xl bg-[var(--color-cream)] px-4 py-3 text-sm text-[var(--color-charcoal)]">{draft.blocked}</p>
              {mayTouch && online ? (
                <Button variant="danger" full busy={working} onClick={() => run({ kind: 'draft.cancel', payload: { n: draft.n } })}>
                  Cancel this draft
                </Button>
              ) : null}
            </div>
          ) : !mayTouch ? (
            <p className="rounded-xl bg-[var(--color-cream)] px-4 py-3 text-sm text-[var(--color-charcoal)]">
              Lando or Marco approve this one.
            </p>
          ) : !online ? (
            <p className="rounded-xl bg-[var(--color-cream)] px-4 py-3 text-sm text-[var(--color-charcoal)]">
              The bot is offline, so nothing can be sent from here right now.
            </p>
          ) : draft.status === 'scheduled' ? (
            <p className="rounded-xl bg-[var(--color-cream)] px-4 py-3 text-sm text-[var(--color-charcoal)]">
              This send is on a timer that was set at the office. Ask Lando if it needs to change.
            </p>
          ) : draft.status === 'approved' ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-[var(--color-charcoal)]">
                Approved{draft.sendAt ? `. It goes out ${dayTime(draft.sendAt)}.` : '.'}
              </p>
              <Button variant="danger" full busy={working} onClick={() => run({ kind: 'draft.cancel', payload: { n: draft.n } })}>
                Stop it and cancel the draft
              </Button>
            </div>
          ) : mine ? (
            <div className="flex flex-col gap-2">
              {mode === 'confirm-send' ? (
                <Button variant="primary" full busy={working} onClick={() => run({ kind: 'draft.approve', payload: { n: draft.n } })}>
                  <Send className="size-4" aria-hidden="true" />
                  <span className="truncate">Yes, send to {draft.to}</span>
                </Button>
              ) : (
                <Button variant="primary" full disabled={working} onClick={() => arm('confirm-send')}>
                  <Send className="size-4" aria-hidden="true" /> Approve &amp; send
                </Button>
              )}

              {mode === 'schedule' ? (
                <div className="rounded-xl border border-[var(--color-stone)] bg-white p-3">
                  <label className="block text-xs font-medium text-[var(--color-charcoal)] mb-1.5" htmlFor="draft-send-at">
                    Send it at
                  </label>
                  <input id="draft-send-at" type="time" value={at} onChange={(e) => setAt(e.target.value)} className={INPUT} />
                  <p className="mt-1.5 text-[11px] text-[var(--color-charcoal-light)]">
                    Phoenix time. A time that has already passed today means tomorrow.
                  </p>
                  <Button
                    variant="primary"
                    full
                    className="mt-2.5"
                    busy={working}
                    disabled={!/^\d{2}:\d{2}$/.test(at)}
                    onClick={() => run({ kind: 'draft.schedule', payload: { n: draft.n, at } })}
                  >
                    <Clock className="size-4" aria-hidden="true" /> Approve, and send at {clock12(at)}
                  </Button>
                </div>
              ) : (
                <Button full disabled={working} onClick={() => arm('schedule')}>
                  <Clock className="size-4" aria-hidden="true" /> Send later
                </Button>
              )}

              {mode === 'confirm-cancel' ? (
                <Button variant="danger" full busy={working} onClick={() => run({ kind: 'draft.cancel', payload: { n: draft.n } })}>
                  Yes, cancel this draft
                </Button>
              ) : (
                <Button variant="quiet" full disabled={working} onClick={() => arm('confirm-cancel')}>
                  Cancel draft
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </BottomSheet>
  )
}
