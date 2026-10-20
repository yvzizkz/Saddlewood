'use client'

import { useState } from 'react'
import { ArrowUp, Check, Plus, X } from 'lucide-react'

import { botApi } from '@/components/bot/BotProvider'
import { Button, INPUT, TONE } from '@/components/bot/ui'
import { stageText } from '@/lib/crew/phases'
import { dayShort } from '@/lib/crew/time'
import type { AdminActInput, CrewJobPhase, JobStage } from '@/lib/crew/types'

// The stage of a job (0024): its phases left to right, the done ones ticked,
// the current one marked with the day it is on, "behind" in red when its plan
// has run out. A phase is verified by a person here (the project manager on
// their jobs, an owner anywhere), never by the worker. Shown on the owners'
// job sheet and on the Projects screen; nothing of it on the worker's screens.

export type PhaseActor = (input: AdminActInput) => Promise<{ ok: boolean; text: string }>

/** Posts a Crew-screen act from a screen outside the Crew provider (Projects on its own page). */
export async function postPhaseAct(input: AdminActInput): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await botApi<{ ok: true; note?: string }>('/api/crew/admin', { method: 'POST', body: JSON.stringify(input) })
    return { ok: true, text: res.note ?? '' }
  } catch (e) {
    return { ok: false, text: (e as Error).message }
  }
}

export type PhaseCan = {
  /** May tick a phase off, or take a tick back (tasks.verify; owners anywhere). */
  verify: boolean
  /** May set the list: templates, names, order (jobs.manage, or a project manager on their jobs). */
  edit: boolean
  /** May set the planned dates (jobs.promise, jobs.manage, or a project manager on their jobs). */
  plan: boolean
}

const RED = TONE.bad.fg

/** " · hang, day 3", red with "behind" when the plan has run out. After a job's name in a list. */
export function StageWord({ stage }: { stage: JobStage | null | undefined }) {
  const text = stageText(stage ?? null)
  if (!text) return null
  return (
    <span className="text-[12px] font-normal text-[var(--color-charcoal-light)]" style={stage?.behind ? { color: RED, fontWeight: 500 } : undefined}>
      {' · '}
      {text}
      {stage?.behind ? ', behind' : ''}
    </span>
  )
}

function Problem({ text }: { text: string }) {
  if (!text) return null
  return (
    <p role="alert" className="mt-2 rounded-xl px-3 py-2 text-[13px]" style={{ backgroundColor: TONE.bad.bg, color: '#7f1d1d' }}>
      {text}
    </p>
  )
}

const TEMPLATE_LABEL = { framing: 'Framing', drywall: 'Drywall', both: 'Both' } as const

export function StageStrip({
  jobId,
  jobName,
  phases,
  stage,
  today,
  can,
  act,
}: {
  jobId: string
  jobName: string
  phases: CrewJobPhase[]
  stage: JobStage | null
  today: string
  can: PhaseCan
  act: PhaseActor
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState('')
  /** The phase a tap asked about, before it is verified or unverified. */
  const [asking, setAsking] = useState<CrewJobPhase | null>(null)
  const [note, setNote] = useState('')

  async function run(key: string, input: AdminActInput): Promise<boolean> {
    setBusy(key)
    setProblem('')
    const res = await act(input)
    setBusy(null)
    if (!res.ok) setProblem(res.text)
    return res.ok
  }

  async function decide() {
    if (!asking) return
    const verified = !!asking.verifiedAt
    if (verified && note.trim().length < 3) return setProblem('Say why, so the record shows it.')
    const ok = await run(
      `phase-${asking.id}`,
      verified ? { kind: 'phase.unverify', id: asking.id, note: note.trim() } : { kind: 'phase.verify', id: asking.id, note: note.trim() },
    )
    if (ok) {
      setAsking(null)
      setNote('')
    }
  }

  if (mode === 'edit') {
    return <PhasesEditor jobId={jobId} phases={phases} act={act} onDone={() => setMode('view')} />
  }

  if (!phases.length) {
    if (!can.edit) return <p className="text-[12px] text-[var(--color-charcoal-light)]">No phases yet, so no stage.</p>
    return (
      <div>
        <p className="mb-1.5 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">Add phases, and the job has a stage: {jobName} is on the first one nobody has verified.</p>
        <div className="flex flex-wrap gap-2">
          {(['framing', 'drywall', 'both'] as const).map((t) => (
            <Button key={t} className="min-h-9 px-3 text-[13px]" busy={busy === t} onClick={() => run(t, { kind: 'job.phases.template', jobId, template: t })}>
              {TEMPLATE_LABEL[t]}
            </Button>
          ))}
          <Button className="min-h-9 px-3 text-[13px]" onClick={() => setMode('edit')}>
            Write your own
          </Button>
        </div>
        <Problem text={problem} />
      </div>
    )
  }

  const current = stage && !stage.complete ? stage : null
  return (
    <div>
      <ol className="flex flex-wrap gap-1.5" aria-label={`${jobName}: phases`}>
        {phases.map((p) => {
          const done = !!p.verifiedAt
          const isCurrent = current?.id === p.id
          const behind = isCurrent && current.behind
          const style = done
            ? { color: TONE.ok.fg, backgroundColor: TONE.ok.bg }
            : isCurrent
              ? { color: 'var(--color-cream)', backgroundColor: behind ? RED : 'var(--color-charcoal)' }
              : { color: TONE.quiet.fg, backgroundColor: TONE.quiet.bg }
          const label = (
            <>
              {done ? <Check className="size-3" aria-hidden="true" /> : null}
              {p.name}
              {isCurrent && current.day ? <span className="opacity-80">{` · day ${current.day}`}</span> : null}
            </>
          )
          const title = done ? `${p.name}: verified by ${p.verifiedBy || 'someone'}` : isCurrent ? `${p.name}: where the job is` : `${p.name}: not yet`
          return (
            <li key={p.id} className="contents">
              {can.verify ? (
                <button
                  type="button"
                  title={title}
                  aria-label={`${title}. ${done ? 'Unverify' : 'Verify'}`}
                  aria-pressed={asking?.id === p.id}
                  onClick={() => {
                    setProblem('')
                    setNote('')
                    setAsking(asking?.id === p.id ? null : p)
                  }}
                  className={`inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-[13px] font-medium ${asking?.id === p.id ? 'ring-2 ring-[var(--color-teal)]' : ''}`}
                  style={style}
                >
                  {label}
                </button>
              ) : (
                <span title={title} className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-[13px] font-medium" style={style}>
                  {label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-1.5 text-[12px] text-[var(--color-charcoal-light)]">
        {stage?.complete ? (
          `Every phase verified${stage.sinceDay ? ` · done ${dayShort(stage.sinceDay)}` : ''}.`
        ) : current ? (
          <>
            {current.name}, {current.ord} of {current.of}
            {current.day ? `, day ${current.day}` : ''}
            {current.plannedDays ? ` of ${current.plannedDays} planned` : ''}
            {current.plannedFrom || current.plannedTo ? ` · ${current.plannedFrom ? dayShort(current.plannedFrom) : '?'} to ${current.plannedTo ? dayShort(current.plannedTo) : '?'}` : ''}
            {current.behind ? (
              <span style={{ color: RED, fontWeight: 500 }}>
                {' · '}behind: its plan ended {dayShort(current.plannedTo as string)}, today is {dayShort(today)}
              </span>
            ) : null}
          </>
        ) : null}
      </p>

      {asking ? (
        <div className="mt-2 rounded-xl border border-[var(--color-stone-mid)] bg-[var(--color-cream)] p-3">
          <p className="text-[13px] text-[var(--color-charcoal)]">
            {asking.verifiedAt ? (
              <>
                <span className="font-medium">Take back the check on {asking.name}?</span> {asking.verifiedBy || 'Someone'} verified it. Say what is not done.
              </>
            ) : (
              <>
                <span className="font-medium">Verify {asking.name}:</span> you looked at it and it is done. {asking.id !== current?.id ? 'This is not the current phase; verifying it out of order is allowed.' : ''}
              </>
            )}
          </p>
          <input
            className={`${INPUT} mt-2`}
            value={note}
            maxLength={300}
            placeholder={asking.verifiedAt ? 'What is left' : 'Note (optional)'}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button variant={asking.verifiedAt ? 'danger' : 'primary'} className="min-h-10 flex-1" busy={busy === `phase-${asking.id}`} onClick={decide}>
              {asking.verifiedAt ? 'Unverify' : 'Verify'}
            </Button>
            <Button className="min-h-10" onClick={() => setAsking(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : current && can.verify ? (
        <Button
          variant="primary"
          className="mt-2 min-h-10"
          onClick={() => {
            setProblem('')
            setNote('')
            setAsking(phases.find((p) => p.id === current.id) ?? null)
          }}
        >
          <Check className="size-4" aria-hidden="true" /> Verify {current.name}
        </Button>
      ) : null}
      {can.edit && !asking ? (
        <button type="button" onClick={() => setMode('edit')} className="ml-3 mt-2 min-h-9 text-[13px] text-[var(--color-charcoal-light)] underline underline-offset-2">
          Edit phases
        </button>
      ) : null}
      <Problem text={problem} />
    </div>
  )
}

type Draft = { key: string; name: string; trade: string; from: string; to: string; verified: boolean; by: string }

const blank = (n: number): Draft => ({ key: `new-${n}`, name: '', trade: '', from: '', to: '', verified: false, by: '' })

/**
 * The list by hand: names in order, each with optional planned dates. A
 * verified phase stays where it is (its name is locked, it cannot be removed);
 * the server refuses a list that drops one. Saving replaces the unverified
 * phases with what is here.
 */
function PhasesEditor({ jobId, phases, act, onDone }: { jobId: string; phases: CrewJobPhase[]; act: PhaseActor; onDone: () => void }) {
  const [rows, setRows] = useState<Draft[]>(() =>
    phases.length
      ? phases.map((p) => ({ key: String(p.id), name: p.name, trade: p.trade, from: p.plannedFrom ?? '', to: p.plannedTo ?? '', verified: !!p.verifiedAt, by: p.verifiedBy }))
      : [blank(1), blank(2), blank(3)],
  )
  const [made, setMade] = useState(3)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  const patch = (key: string, change: Partial<Draft>) => setRows((now) => now.map((r) => (r.key === key ? { ...r, ...change } : r)))
  const remove = (key: string) => setRows((now) => now.filter((r) => r.key !== key))
  const up = (key: string) =>
    setRows((now) => {
      const i = now.findIndex((r) => r.key === key)
      if (i <= 0) return now
      const next = [...now]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  const add = () => {
    setRows((now) => [...now, blank(made + 1)])
    setMade((n) => n + 1)
  }

  async function save() {
    const list = rows.filter((r) => r.name.trim())
    for (const r of list) if (r.from && r.to && r.from > r.to) return setProblem(`${r.name.trim()}: the plan ends before it starts.`)
    if (!list.length && phases.some((p) => p.verifiedAt)) return setProblem('A verified phase cannot be removed.')
    setBusy(true)
    setProblem('')
    const res = await act({
      kind: 'job.phases.set',
      jobId,
      phases: list.map((r) => ({ name: r.name.trim(), trade: r.trade, plannedFrom: r.from, plannedTo: r.to })),
    })
    setBusy(false)
    if (!res.ok) return setProblem(res.text)
    onDone()
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">
        Phases in order, top to bottom. Dates are what you expect, not a promise. A verified phase stays put.
      </p>
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-xl border border-[var(--color-stone)] bg-white p-2">
            <div className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-[12px] text-[var(--color-charcoal-light)]">{i + 1}</span>
              {r.verified ? (
                <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--color-charcoal)]" title={`Verified by ${r.by || 'someone'}`}>
                  <Check className="mr-1 inline size-3.5" aria-hidden="true" style={{ color: TONE.ok.fg }} />
                  {r.name}
                </span>
              ) : (
                <input
                  className={`${INPUT} min-w-0 flex-1 py-2`}
                  value={r.name}
                  maxLength={60}
                  placeholder="Phase"
                  aria-label={`Phase ${i + 1} name`}
                  onChange={(e) => patch(r.key, { name: e.target.value })}
                />
              )}
              <button
                type="button"
                aria-label={`Move ${r.name || `phase ${i + 1}`} up`}
                disabled={i === 0}
                onClick={() => up(r.key)}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-charcoal-light)] disabled:opacity-30"
              >
                <ArrowUp className="size-4" aria-hidden="true" />
              </button>
              {r.verified ? (
                <span className="size-9 shrink-0" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  aria-label={`Remove ${r.name || `phase ${i + 1}`}`}
                  onClick={() => remove(r.key)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-charcoal-light)]"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2 pl-7">
              <input type="date" className={`${INPUT} py-1.5 text-[14px]`} value={r.from} aria-label={`${r.name || `Phase ${i + 1}`} planned from`} onChange={(e) => patch(r.key, { from: e.target.value })} />
              <input type="date" className={`${INPUT} py-1.5 text-[14px]`} value={r.to} min={r.from || undefined} aria-label={`${r.name || `Phase ${i + 1}`} planned to`} onChange={(e) => patch(r.key, { to: e.target.value })} />
            </div>
          </li>
        ))}
      </ol>
      <Button className="min-h-9 px-3 text-[13px]" onClick={add}>
        <Plus className="size-4" aria-hidden="true" /> Add a phase
      </Button>
      <Problem text={problem} />
      <div className="flex gap-2">
        <Button variant="primary" className="min-h-11 flex-1" busy={busy} onClick={save}>
          Save phases
        </Button>
        <Button className="min-h-11" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
