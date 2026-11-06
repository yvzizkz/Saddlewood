'use client'

// An owner's control of the client's link to this job: make it, pick what it
// shows, copy it to send, turn it off. Nothing here contacts the client.

import { useState } from 'react'

import { Button, Card } from '@/components/bot/ui'
import { usd } from '@/lib/money'
import { PORTAL_SECTIONS, SECTION_INFO, type ClientMoney, type PortalSection } from '@/lib/portal/rules'

type Preview = { money: ClientMoney | null; unplacedCents: number; timeline: boolean }
export type PortalState = { href: string; sections: PortalSection[]; preview: Preview } | null

/** What turning a section on would show, for the two that can have nothing to show. */
function willShow(s: PortalSection, p: Preview): string | null {
  if (s === 'timeline') return p.timeline ? null : "No dates on this job yet, so the client won't see this."
  if (s !== 'payments') return null
  if (p.unplacedCents) return `${usd(p.unplacedCents)} received isn't on a job yet and could be this one's, so the client won't see this until it's applied to its bill or statement lines.`
  if (!p.money) return "Nothing billed or paid in this app yet, so the client won't see this."
  const { contractCents: c, billedCents, paidCents, openCents } = p.money
  return `The client will see: ${[c === null ? null : `Contract ${usd(c)}`, `Billed ${usd(billedCents)}`, `Paid ${usd(paidCents)}`, `Open ${usd(openCents)}`].filter(Boolean).join(' · ')}`
}

export default function ClientPortalCard({ job, origin, initial }: { job: string; origin: string; initial: PortalState }) {
  const [portal, setPortal] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [sure, setSure] = useState(false)
  const url = `/api/jobs/${encodeURIComponent(job)}/portal`

  const call = async (method: string, body?: unknown) => {
    setBusy(true)
    setErr('')
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    const data = ((await res?.json().catch(() => null)) ?? null) as { token?: string; sections?: PortalSection[]; preview?: Preview; error?: string } | null
    setBusy(false)
    if (res?.ok) return data ?? {}
    setErr(data?.error ?? 'Could not save.')
    return null
  }

  const make = async () => {
    const r = await call('POST')
    if (r?.token) setPortal({ href: `${origin}/c/${r.token}`, sections: r.sections ?? [], preview: r.preview ?? { money: null, unplacedCents: 0, timeline: false } })
  }
  const toggle = async (s: PortalSection, on: boolean) => {
    if (!portal) return
    const next = PORTAL_SECTIONS.filter((x) => (x === s ? on : portal.sections.includes(x)))
    // The box moves on the click; a refused save puts it back and says why.
    setPortal({ ...portal, sections: next })
    const r = await call('PATCH', { sections: next })
    setPortal({ ...portal, sections: r?.sections ?? portal.sections })
  }
  const turnOff = async () => {
    if (await call('DELETE')) {
      setPortal(null)
      setSure(false)
    }
  }
  const copy = async () => {
    if (!portal) return
    await navigator.clipboard.writeText(portal.href).catch(() => null)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="p-4">
      <section aria-label="Client link">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Client link</p>
        {!portal ? (
          <>
            <p className="mb-3 text-sm text-[var(--color-charcoal-light)]">A page for this job the client opens with no sign-in. It shows the job&apos;s name, address and PM, and nothing else until you turn a section on.</p>
            <Button variant="quiet" busy={busy} onClick={make}>
              Make a client link
            </Button>
          </>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input aria-label="The client's link" readOnly value={portal.href} className="min-w-0 flex-1 rounded-lg border border-[var(--color-stone)] bg-[var(--color-background)] px-2.5 py-1.5 text-xs text-[var(--color-charcoal)]" />
              <Button variant="quiet" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <ul className="mb-3 grid gap-2">
              {PORTAL_SECTIONS.map((s) => (
                <li key={s}>
                  <label className="flex items-start gap-2 text-sm text-[var(--color-charcoal)]">
                    <input type="checkbox" className="mt-1" disabled={busy} checked={portal.sections.includes(s)} onChange={(e) => toggle(s, e.target.checked)} />
                    <span>
                      {SECTION_INFO[s].label}
                      <span className="block text-xs text-[var(--color-charcoal-light)]">{SECTION_INFO[s].hint}</span>
                      {willShow(s, portal.preview) ? <span className="block text-xs font-medium text-[var(--color-charcoal)]">{willShow(s, portal.preview)}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {sure ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--color-charcoal)]">This link stops working for good.</span>
                <Button variant="primary" busy={busy} onClick={turnOff}>
                  Yes, turn it off
                </Button>
                <Button variant="quiet" onClick={() => setSure(false)}>
                  Keep it
                </Button>
              </div>
            ) : (
              <Button variant="quiet" onClick={() => setSure(true)}>
                Turn off this link
              </Button>
            )}
          </>
        )}
        {err ? <p className="mt-2 text-sm text-[#9a2a1f]">{err}</p> : null}
      </section>
    </Card>
  )
}
