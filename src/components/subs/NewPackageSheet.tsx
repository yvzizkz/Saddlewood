'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { botApi } from '@/components/bot/BotProvider'
import { Button, Field, INPUT } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import type { ScopeSource } from '@/lib/subs/source'
import { usd } from '@/components/sales/format'

// A new bid package (SOP-008 stage 1): for an awarded job or an opportunity
// still being priced, one trade, its lines taken from that section of the
// estimate with our own cost on each (kept inside the app), or started empty.

type Target = { jobId: string | null; opportunityId: string | null; name: string }
type Targets = { jobs: { jobId: string; opportunityId: string | null; name: string; address: string }[]; opportunities: { opportunityId: string; number: string; title: string; address: string; stage: string }[] }

export function NewPackageSheet({ open, onClose, target: given, toast }: { open: boolean; onClose: () => void; target?: Target | null; toast: (m: string, t?: 'ok' | 'bad') => void }) {
  const router = useRouter()
  const [target, setTarget] = useState<Target | null>(given ?? null)
  const [targets, setTargets] = useState<Targets | null>(null)
  const [source, setSource] = useState<ScopeSource | null>(null)
  const [section, setSection] = useState<string>('')
  const [trade, setTrade] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Reset when it opens, or when it is opened for another job; the caller may pass a fresh object each render.
  const givenKey = given ? `${given.jobId ?? ''}|${given.opportunityId ?? ''}` : ''
  useEffect(() => {
    if (!open) return
    setTarget(given ?? null)
    setSource(null)
    setSection('')
    setTrade('')
    setTitle('')
    setError('')
    if (!given) botApi<Targets>('/api/bids/targets').then(setTargets).catch((e) => setError((e as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, givenKey])

  useEffect(() => {
    if (!open || !target) return
    const q = target.jobId ? `jobId=${target.jobId}` : `opportunityId=${target.opportunityId}`
    botApi<{ source: ScopeSource }>(`/api/bids/source?${q}`)
      .then((r) => setSource(r.source))
      .catch((e) => setError((e as Error).message))
  }, [open, target])

  function pick(id: string) {
    setSection(id)
    const s = source?.sections.find((x) => x.id === id)
    const where = target?.name ?? source?.title ?? ''
    if (s) {
      setTrade(s.name.toLowerCase())
      setTitle(`${s.name}: ${where}`)
    } else {
      setTitle(trade ? `${trade[0].toUpperCase()}${trade.slice(1)}: ${where}` : '')
    }
  }

  async function create() {
    if (!target) return
    setBusy(true)
    try {
      const s = source?.sections.find((x) => x.id === section)
      const r = await botApi<{ package: { id: string } }>('/api/bids', {
        method: 'POST',
        body: JSON.stringify({
          jobId: target.jobId,
          opportunityId: target.opportunityId,
          trade: trade.trim(),
          title: title.trim() || `${trade.trim()}: ${target.name}`,
          scope: '',
          lines: s ? s.lines.map((l) => ({ ...l, id: '' })) : [],
          exclusions: [],
          workFrom: null,
          workTo: null,
          siteWalk: '',
          dueAt: null,
          terms: 'Priced against our Master Subcontract Agreement and work order. No extra work without our written change order.',
        }),
      })
      toast('Package started', 'ok')
      onClose()
      router.push(`/app/subs/bids/${r.package.id}`)
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="New bid package" maxHeightDvh={90}>
      <div className="space-y-4 px-5 pb-6 pt-4">
        {error ? <p className="text-sm text-[#9a2a1f]">{error}</p> : null}
        {!target ? (
          !targets ? (
            <div className="h-24 animate-pulse rounded-xl bg-[var(--color-cream)]" aria-busy="true" />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-charcoal)]">What is it for?</p>
              {targets.jobs.length ? <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--color-gold-accessible)]">Awarded jobs</p> : null}
              {targets.jobs.map((j) => (
                <button key={j.jobId} type="button" onClick={() => setTarget({ jobId: j.jobId, opportunityId: j.opportunityId, name: j.name })} className="block w-full rounded-xl border border-[var(--color-stone)] bg-white px-3 py-2.5 text-left">
                  <span className="block text-sm text-[var(--color-charcoal)]">{j.name}</span>
                  <span className="block text-xs text-[var(--color-charcoal-light)]">{j.address}</span>
                </button>
              ))}
              {targets.opportunities.length ? <p className="pt-2 text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--color-gold-accessible)]">Still being priced</p> : null}
              {targets.opportunities.map((o) => (
                <button key={o.opportunityId} type="button" onClick={() => setTarget({ jobId: null, opportunityId: o.opportunityId, name: o.address.split(',')[0] || o.title })} className="block w-full rounded-xl border border-[var(--color-stone)] bg-white px-3 py-2.5 text-left">
                  <span className="block text-sm text-[var(--color-charcoal)]">{o.title}</span>
                  <span className="block text-xs text-[var(--color-charcoal-light)]">
                    {o.number} · {o.address}
                  </span>
                </button>
              ))}
              {!targets.jobs.length && !targets.opportunities.length ? <p className="text-sm text-[var(--color-charcoal-light)]">No awarded jobs or open opportunities yet.</p> : null}
            </div>
          )
        ) : (
          <>
            <p className="text-sm text-[var(--color-charcoal)]">
              For <span className="font-medium">{target.name}</span>
              {!given ? (
                <button type="button" className="ml-2 text-xs text-[var(--color-teal)] underline" onClick={() => setTarget(null)}>
                  change
                </button>
              ) : null}
            </p>
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">Start the scope from</p>
              {!source ? (
                <div className="h-16 animate-pulse rounded-xl bg-[var(--color-cream)]" aria-busy="true" />
              ) : (
                <div className="space-y-2">
                  {source.sections.map((s) => (
                    <label key={s.id} className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 ${section === s.id ? 'border-[var(--color-teal)] bg-[var(--color-teal)]/5' : 'border-[var(--color-stone)] bg-white'}`}>
                      <span>
                        <span className="block text-sm text-[var(--color-charcoal)]">{s.name}</span>
                        <span className="block text-[11px] text-[var(--color-charcoal-light)]">
                          {s.lines.length} {s.lines.length === 1 ? 'line' : 'lines'} · our cost {usd(s.ourCents, { whole: true })}
                        </span>
                      </span>
                      <input type="radio" name="section" className="size-5 accent-[var(--color-teal)]" checked={section === s.id} onChange={() => pick(s.id)} />
                    </label>
                  ))}
                  <label className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 ${section === 'empty' ? 'border-[var(--color-teal)]' : 'border-[var(--color-stone)] bg-white'}`}>
                    <span className="text-sm text-[var(--color-charcoal)]">Start empty</span>
                    <input type="radio" name="section" className="size-5 accent-[var(--color-teal)]" checked={section === 'empty'} onChange={() => pick('empty')} />
                  </label>
                  {source.estimate ? (
                    <p className="text-[11px] text-[var(--color-charcoal-light)]">
                      From estimate {source.estimate.name || `version ${source.estimate.version}`}. Our cost stays in the app; subs never see it.
                    </p>
                  ) : (
                    <p className="text-[11px] text-[var(--color-charcoal-light)]">There is no estimate to start from; add the lines by hand.</p>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <Field label="Trade">
                <input className={INPUT} value={trade} placeholder="insulation" onChange={(e) => setTrade(e.target.value)} />
              </Field>
              <Field label="Title">
                <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
            </div>
            <Button variant="primary" full busy={busy} disabled={!section || trade.trim().length < 2} onClick={create}>
              Start the package
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
