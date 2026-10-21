'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Plus, Search } from 'lucide-react'

import { botApi } from '@/components/bot/BotProvider'
import { Button, Card, Chip, Empty, INPUT, ScreenTitle, Segmented } from '@/components/bot/ui'
import { shortDay, usd } from '@/components/sales/format'
import { useSalesToast } from '@/components/sales/useSalesToast'
import { coiDaysLeft, readiness } from '@/lib/subs/rules'
import type { ComplianceSummary, SubScorecard } from '@/lib/subs/scorecard'
import { SUB_STATUS_LABEL, type PackageStatus, type Sub } from '@/lib/subs/types'
import { NewPackageSheet } from './NewPackageSheet'
import { SubSheet } from './SubSheet'
import { localDay } from '@/lib/crew/time'

// Subs and bids (SOP-008): the bid packages out and coming back, and the
// directory of subs with what each still owes before they can start.

type PackageRow = {
  id: string
  title: string
  trade: string
  status: PackageStatus
  dueAt: string | null
  job: { name: string; address: string }
  invited: number
  bids: number
  declined: number
  createdAt: string
}

export const STATUS_CHIP: Record<PackageStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'quiet' | 'ink' }> = {
  draft: { label: 'Draft', tone: 'quiet' },
  out: { label: 'Out to bid', tone: 'ink' },
  closed: { label: 'Bidding closed', tone: 'warn' },
  awarded: { label: 'Awarded', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'quiet' },
}

export default function SubsScreen() {
  const { toast } = useSalesToast()
  const [tab, setTab] = useState<'bids' | 'subs' | 'scorecard'>('bids')
  const [packages, setPackages] = useState<PackageRow[] | null>(null)
  const [subs, setSubs] = useState<Sub[] | null>(null)
  const [scorecards, setScorecards] = useState<SubScorecard[] | null>(null)
  const [complianceSummary, setComplianceSummary] = useState<ComplianceSummary | null>(null)
  const [can, setCan] = useState({ manage: false, award: false })
  const [isOwner, setIsOwner] = useState(false)
  const [q, setQ] = useState('')
  const [trade, setTrade] = useState('')
  const [editing, setEditing] = useState<Sub | 'new' | null>(null)
  const [newPkg, setNewPkg] = useState(false)
  const [error, setError] = useState('')
  const today = localDay()

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        botApi<{ packages: PackageRow[]; can: typeof can }>('/api/bids'),
        botApi<{ subs: Sub[]; scorecards?: SubScorecard[]; complianceSummary?: ComplianceSummary; me?: { role?: string } }>('/api/subs'),
      ])
      setPackages(p.packages)
      setSubs(s.subs)
      setScorecards(s.scorecards ?? null)
      setComplianceSummary(s.complianceSummary ?? null)
      setCan(p.can)
      setIsOwner(s.me?.role === 'owner')
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

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

  const trades = useMemo(() => [...new Set((subs ?? []).flatMap((s) => s.trades))].sort(), [subs])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (subs ?? []).filter(
      (s) =>
        (!trade || s.trades.includes(trade)) &&
        (!needle || s.name.toLowerCase().includes(needle) || s.trades.some((t) => t.includes(needle)) || s.contacts.some((c) => c.name.toLowerCase().includes(needle) || c.email.includes(needle))),
    )
  }, [subs, q, trade])

  const live = (packages ?? []).filter((p) => p.status === 'out' || p.status === 'closed' || p.status === 'draft')
  const done = (packages ?? []).filter((p) => p.status === 'awarded' || p.status === 'cancelled')

  return (
    <div className="px-4 pb-28 pt-5">
      <ScreenTitle eyebrow="SOP-008" title="Subs and bids" />
      <Segmented
        label="View"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'bids', label: 'Bids', count: live.length },
          { value: 'subs', label: 'Directory', count: subs?.length },
          { value: 'scorecard', label: 'Compliance & Scorecard', count: complianceSummary?.expiredOrMissingCoiCount },
        ]}
      />
      {error ? <p className="mt-3 text-sm text-[#9a2a1f]">{error}</p> : null}

      {tab === 'bids' ? (
        <div className="mt-4 space-y-3">
          {can.manage ? (
            <Button variant="primary" full onClick={() => setNewPkg(true)}>
              <Plus className="size-4" aria-hidden="true" /> New bid package
            </Button>
          ) : null}
          {!packages ? (
            <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-cream)]" aria-busy="true" />
          ) : packages.length === 0 ? (
            <Empty>No bid packages yet. Start one from an awarded job or an opportunity being priced.</Empty>
          ) : (
            <>
              {[...live, ...done].map((p) => {
                const late = p.status === 'out' && p.dueAt && p.dueAt < new Date().toISOString()
                return (
                  <Link key={p.id} href={`/app/subs/bids/${p.id}`} className="block">
                    <Card className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--color-charcoal)]">{p.title}</p>
                          <p className="truncate text-xs text-[var(--color-charcoal-light)]">{p.job.address || p.job.name}</p>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-[var(--color-charcoal-light)]" aria-hidden="true" />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Chip tone={STATUS_CHIP[p.status].tone}>{STATUS_CHIP[p.status].label}</Chip>
                        <Chip tone="quiet">{p.trade}</Chip>
                        {p.invited ? (
                          <Chip tone={p.bids ? 'ok' : 'quiet'}>
                            {p.bids} of {p.invited} bid{p.declined ? `, ${p.declined} passed` : ''}
                          </Chip>
                        ) : null}
                        {p.dueAt && (p.status === 'out' || p.status === 'draft') ? <Chip tone={late ? 'warn' : 'quiet'}>{late ? 'Was due' : 'Due'} {shortDay(p.dueAt)}</Chip> : null}
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </>
          )}
        </div>
      ) : tab === 'subs' ? (
        <div className="mt-4 space-y-3">
          {can.manage ? (
            <Button variant="primary" full onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden="true" /> Add a sub
            </Button>
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-charcoal-light)]" aria-hidden="true" />
            <input className={`${INPUT} pl-9`} placeholder="Name, trade or person" aria-label="Search the directory" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {trades.length ? (
            <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
              <div className="flex min-w-max gap-1.5">
                {['', ...trades].map((t) => (
                  <button
                    key={t || 'all'}
                    type="button"
                    aria-pressed={trade === t}
                    onClick={() => setTrade(t)}
                    className={`min-h-9 rounded-full border px-3 text-[13px] ${trade === t ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]'}`}
                  >
                    {t || 'All trades'}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {!subs ? (
            <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-cream)]" aria-busy="true" />
          ) : shown.length === 0 ? (
            <Empty>{subs.length ? 'Nobody matches.' : 'The directory is empty. Add the subs you work with, and the ones you want to try.'}</Empty>
          ) : (
            shown.map((s) => {
              const r = readiness(s, today)
              const coi = coiDaysLeft(s.coiExpiresOn, today)
              const primary = s.contacts.find((c) => c.isPrimary) ?? s.contacts[0]
              return (
                <button key={s.id} type="button" onClick={() => setEditing(s)} className="block w-full text-left">
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-charcoal)]">{s.name}</p>
                        <p className="truncate text-xs text-[var(--color-charcoal-light)]">
                          {s.trades.join(', ') || 'No trade yet'}
                          {primary ? ` · ${primary.name || primary.email}` : ''}
                        </p>
                      </div>
                      <Chip tone={s.status === 'approved' ? 'ok' : s.status === 'inactive' ? 'quiet' : 'warn'}>{SUB_STATUS_LABEL[s.status]}</Chip>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.ready ? <Chip tone="ok">Ready to start</Chip> : <Chip tone="quiet">{r.missing.length} to finish</Chip>}
                      {coi !== null && coi < 0 ? <Chip tone="bad">Insurance expired</Chip> : coi !== null && coi <= 30 ? <Chip tone="warn">Insurance ends in {coi} days</Chip> : null}
                    </div>
                  </Card>
                </button>
              )
            })
          )}
        </div>
      ) : null}

      {tab === 'scorecard' ? (
        <div className="mt-4 space-y-3">
          {complianceSummary ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Card className="p-3">
                <p className="text-[11px] text-[var(--color-charcoal-light)]">Cleared to mobilize</p>
                <p className="text-lg font-semibold text-[#1f6a3b]">
                  {complianceSummary.readyCount} / {complianceSummary.totalSubs}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] text-[var(--color-charcoal-light)]">Expired / missing COI</p>
                <p className={`text-lg font-semibold ${complianceSummary.expiredOrMissingCoiCount ? 'text-[#9a2a1f]' : 'text-[var(--color-charcoal)]'}`}>
                  {complianceSummary.expiredOrMissingCoiCount}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] text-[var(--color-charcoal-light)]">COI expiring ≤ 30d</p>
                <p className={`text-lg font-semibold ${complianceSummary.expiring30dCoiCount ? 'text-[#8f6c18]' : 'text-[var(--color-charcoal)]'}`}>
                  {complianceSummary.expiring30dCoiCount}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] text-[var(--color-charcoal-light)]">Missing W-9 or MSA</p>
                <p className={`text-lg font-semibold ${complianceSummary.missingW9OrMsaCount ? 'text-[#8f6c18]' : 'text-[var(--color-charcoal)]'}`}>
                  {complianceSummary.missingW9OrMsaCount}
                </p>
              </Card>
            </div>
          ) : null}

          {!scorecards ? (
            <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-cream)]" aria-busy="true" />
          ) : scorecards.length === 0 ? (
            <Empty>No subs in the directory yet.</Empty>
          ) : (
            scorecards.map((sc) => {
              const full = subs?.find((x) => x.id === sc.subId) ?? null
              return (
                <button key={sc.subId} type="button" onClick={() => full && setEditing(full)} className="block w-full text-left">
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-charcoal)]">{sc.name}</p>
                        <p className="truncate text-xs text-[var(--color-charcoal-light)]">
                          {sc.trades.join(', ') || 'No trade'} {sc.rocLicense ? `· ROC ${sc.rocLicense}` : '· No ROC on file'}
                        </p>
                      </div>
                      <Chip tone={sc.readyToMobilize ? 'ok' : sc.coiState === 'expired' ? 'bad' : 'warn'}>
                        {sc.readyToMobilize ? 'Cleared to mobilize' : 'Hold before start'}
                      </Chip>
                    </div>

                    <div className={`mt-2.5 grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-cream)] px-3 py-2 text-xs text-[var(--color-charcoal)] ${isOwner && sc.openBillsCents !== undefined ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Bids / Invited</span>
                        <span className="font-mono font-medium">
                          {sc.submittedCount} / {sc.invitedCount}
                          {sc.responseRatePct !== null ? ` (${sc.responseRatePct}%)` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Awards / Hit rate</span>
                        <span className="font-mono font-medium">
                          {sc.awardedCount} won{sc.hitRatePct !== null ? ` (${sc.hitRatePct}%)` : ''}
                        </span>
                      </div>
                      {isOwner && sc.openBillsCents !== undefined ? (
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Open bills</span>
                          <span className="font-mono font-medium">
                            {sc.openBillsCount ? `${sc.openBillsCount} · ${usd(sc.openBillsCents)}` : '$0.00'}
                            {sc.heldBillsCount ? ` (${sc.heldBillsCount} held)` : ''}
                          </span>
                        </div>
                      ) : null}
                      <div>
                        <span className="block text-[10px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Open punch</span>
                        <span className="font-mono font-medium">{sc.punchOpenCount}</span>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {sc.coiState === 'ok' ? (
                        <Chip tone="ok">COI valid ({sc.coiDaysLeft}d left)</Chip>
                      ) : sc.coiState === 'expiring_30d' ? (
                        <Chip tone="warn">COI expires in {sc.coiDaysLeft}d</Chip>
                      ) : sc.coiState === 'expired' ? (
                        <Chip tone="bad">COI expired ({Math.abs(sc.coiDaysLeft ?? 0)}d ago)</Chip>
                      ) : (
                        <Chip tone="bad">No COI</Chip>
                      )}
                      <Chip tone={sc.w9OnFile ? 'ok' : 'warn'}>{sc.w9OnFile ? 'W-9 on file' : 'Missing W-9'}</Chip>
                      <Chip tone={sc.msaSignedOn ? 'ok' : 'warn'}>{sc.msaSignedOn ? 'MSA signed' : 'Missing MSA'}</Chip>
                      <Chip tone={sc.rocVerified ? 'ok' : 'quiet'}>{sc.rocVerified ? 'ROC verified' : 'ROC unverified'}</Chip>
                      <Chip tone={sc.achConfirmed ? 'ok' : 'quiet'}>{sc.achConfirmed ? 'ACH phone-verified' : 'ACH unconfirmed'}</Chip>
                    </div>
                  </Card>
                </button>
              )
            })
          )}
        </div>
      ) : null}

      <SubSheet
        open={editing !== null}
        sub={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          void load()
        }}
        toast={toast}
      />
      <NewPackageSheet open={newPkg} onClose={() => setNewPkg(false)} toast={toast} />
    </div>
  )
}
