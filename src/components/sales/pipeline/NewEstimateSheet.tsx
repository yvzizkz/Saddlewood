'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, FileInput, Sparkles } from 'lucide-react'

import { botApi } from '@/components/bot/BotProvider'
import { useSalesToast } from '../useSalesToast'
import { Button, Empty } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { TEMPLATES, templateFor, type TemplateKey } from '@/lib/sales/templates'
import type { OpportunityKind, SalesEstimate } from '@/lib/sales/types'
import { shortDay, usd } from '../format'

// Where a new estimate starts: a template for the kind of work (the likely
// one first), a copy of an earlier version (to price a variation without
// touching what was sent), or a takeoff the Mac pipeline already priced.

type PipelineEstimate = { id: string; job: string; version: number; status: string; createdAt: string }
type Version = Omit<SalesEstimate, 'body'>

export function NewEstimateSheet({
  open,
  onClose,
  opportunityId,
  kind,
  versions,
}: {
  open: boolean
  onClose: () => void
  opportunityId: string
  kind: OpportunityKind
  versions: Version[]
}) {
  const router = useRouter()
  const { toast } = useSalesToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [pipeline, setPipeline] = useState<PipelineEstimate[] | null>(null)
  const [showPipeline, setShowPipeline] = useState(false)
  const likely = templateFor(kind)

  useEffect(() => {
    if (!open || !showPipeline || pipeline) return
    botApi<{ estimates: PipelineEstimate[] }>('/api/sales/pipeline-estimates')
      .then((r) => setPipeline(r.estimates))
      .catch((e) => {
        toast((e as Error).message, 'bad')
        setPipeline([])
      })
  }, [open, showPipeline, pipeline, toast])

  async function start(key: string, body: Record<string, string>) {
    setBusy(key)
    try {
      const r = await botApi<{ estimate: SalesEstimate }>(`/api/sales/${opportunityId}/estimates`, { method: 'POST', body: JSON.stringify(body) })
      onClose()
      router.push(`/app/sales/estimate/${r.estimate.id}`)
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(null)
    }
  }

  const ordered = [...TEMPLATES].sort((a, b) => (a.key === likely ? -1 : b.key === likely ? 1 : 0))
  const live = versions.filter((v) => v.status !== 'archived')

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="New estimate" maxHeightDvh={90} narrow>
      <div className="space-y-5 px-5 pb-6 pt-4">
        <div className="grid grid-cols-2 gap-2">
          {ordered.map((t) => {
            const top = t.key === likely
            return (
              <button
                key={t.key}
                type="button"
                disabled={!!busy}
                onClick={() => start(t.key, { template: t.key as TemplateKey })}
                className={`relative flex min-h-[88px] flex-col items-start rounded-2xl border p-3 text-left transition-colors disabled:opacity-60 ${
                  top ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)] active:bg-[var(--color-cream)]'
                }`}
              >
                {top ? (
                  <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-gold)]">
                    <Sparkles className="size-3" aria-hidden="true" /> Fits this job
                  </span>
                ) : null}
                <span className="text-[15px] font-medium">{busy === t.key ? 'Starting…' : t.label}</span>
                <span className={`mt-0.5 text-[12px] leading-snug ${top ? 'text-white/75' : 'text-[var(--color-charcoal-light)]'}`}>{t.hint}</span>
              </button>
            )
          })}
        </div>

        {live.length ? (
          <div>
            <p className="mb-2 text-xs font-medium text-[var(--color-charcoal)]">Copy an earlier version</p>
            <div className="space-y-2">
              {live.map((v) => (
                <Button key={v.id} full className="!justify-between" busy={busy === v.id} disabled={!!busy} onClick={() => start(v.id, { copyOf: v.id })}>
                  <span className="flex items-center gap-2">
                    <Copy className="size-4" aria-hidden="true" /> {v.name || `Version ${v.version}`}
                  </span>
                  <span className="tabular-nums text-[var(--color-charcoal-light)]">{v.sellCents ? usd(v.sellCents, { whole: true }) : ''}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          {!showPipeline ? (
            <Button full onClick={() => setShowPipeline(true)}>
              <FileInput className="size-4" aria-hidden="true" /> From a pipeline takeoff
            </Button>
          ) : (
            <>
              <p className="mb-2 text-xs font-medium text-[var(--color-charcoal)]">Takeoffs priced on the Mac</p>
              {pipeline === null ? <p className="text-sm text-[var(--color-charcoal-light)]">Loading…</p> : null}
              {pipeline && pipeline.length === 0 ? <Empty>No pipeline estimates yet.</Empty> : null}
              <div className="space-y-2">
                {(pipeline ?? []).map((p) => (
                  <Button key={p.id} full className="!justify-between text-left" busy={busy === p.id} disabled={!!busy} onClick={() => start(p.id, { pipelineEstimateId: p.id })}>
                    <span className="min-w-0 truncate">
                      {p.job || 'Untitled'} · v{p.version}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--color-charcoal-light)]">
                      {p.status} · {shortDay(p.createdAt)}
                    </span>
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
