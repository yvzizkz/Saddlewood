'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { botApi } from '@/components/bot/BotProvider'
import { Button, Card, Chip } from '@/components/bot/ui'
import type { Submission } from '@/lib/webforms/store'

const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric' })

function Row({ s, busy, sub, onMark, onAdd }: { s: Submission; busy: boolean; sub?: string; onMark: (s: Submission) => void; onAdd: (s: Submission) => void }) {
  const done = s.status === 'dismissed'
  return (
    <Card className="space-y-1 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-[var(--color-charcoal)]">{s.company || s.name || s.email}</p>
          <p className="flex items-center gap-1.5 text-[12px] text-[var(--color-charcoal-light)]">
            <Chip tone="ok">{s.form === 'careers' ? 'Job' : 'Trade partner'}</Chip>
            <span>
              {s.about ? `${s.about} · ` : ''}
              {when(s.createdAt)}
            </span>
          </p>
        </div>
        <Button className="shrink-0 !px-3" busy={busy} disabled={busy} onClick={() => onMark(s)}>
          {done ? 'Reopen' : 'Done'}
        </Button>
      </div>
      <p className="whitespace-pre-line text-[13px] text-[var(--color-charcoal)]">{s.summary}</p>
      <p className="flex flex-wrap items-center gap-4 text-[13px]">
        {s.form === 'trade_partner' && sub ? (
          <Link className="underline" href={`/app/subs?find=${encodeURIComponent(sub)}`}>
            On Subs as {sub}
          </Link>
        ) : null}
        {s.form === 'trade_partner' && !sub ? (
          <Button className="!px-3" busy={busy} disabled={busy} onClick={() => onAdd(s)}>
            Add to Subs
          </Button>
        ) : null}
        {s.phone ? (
          <a className="underline" href={`tel:${s.phone.replace(/[^0-9+]/g, '')}`}>
            Call
          </a>
        ) : null}
        {s.email ? (
          <a className="underline" href={`mailto:${s.email}`}>
            Email
          </a>
        ) : null}
      </p>
    </Card>
  )
}

export default function ApplicationsList({ rows, onSubs }: { rows: Submission[]; onSubs: Record<number, string> }) {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const waiting = rows.filter((s) => s.status !== 'dismissed')
  const closed = rows.filter((s) => s.status === 'dismissed')

  async function mark(s: Submission) {
    setBusy(s.id)
    setError('')
    try {
      await botApi('/api/sales/inbox', { method: 'PATCH', body: JSON.stringify({ webId: s.id, status: s.status === 'dismissed' ? 'new' : 'dismissed' }) })
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function add(s: Submission) {
    setBusy(s.id)
    setError('')
    try {
      await botApi(`/api/sales/applications/${s.id}/sub`, { method: 'POST' })
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[13px] text-[var(--color-charcoal)]">{error}</p> : null}
      {waiting.length === 0 ? <p className="text-[13px] text-[var(--color-charcoal-light)]">Nothing waiting.</p> : null}
      <ul className="space-y-3">
        {waiting.map((s) => (
          <li key={s.id}>
            <Row s={s} busy={busy === s.id} sub={onSubs[s.id]} onMark={mark} onAdd={add} />
          </li>
        ))}
      </ul>
      {closed.length ? <h2 className="pt-2 text-[13px] font-semibold text-[var(--color-charcoal-light)]">Done</h2> : null}
      <ul className="space-y-3">
        {closed.map((s) => (
          <li key={s.id}>
            <Row s={s} busy={busy === s.id} sub={onSubs[s.id]} onMark={mark} onAdd={add} />
          </li>
        ))}
      </ul>
    </div>
  )
}
