'use client'

import { useCallback, useEffect, useState } from 'react'

import { botApi } from '@/components/bot/BotProvider'
import { Button, Card, Chip, Dot, Empty, SectionTitle, type Tone } from '@/components/bot/ui'
import { StageStrip, postPhaseAct } from '@/components/crew/admin/StageStrip'
import type { ProjectCard, ProjectsView as Data, ProjectTone } from '@/lib/crew/projects'
import { planAsk } from '@/lib/crew/plan'
import { dayShort } from '@/lib/crew/time'
import ProjectMoneySlot from './ProjectMoneySlot'

// Every job on one screen (projects.view): what is stuck, what is promised,
// what was checked and what was sent back, who is on it, and the latest plans.
// The server decides which jobs (a project manager sees the ones they are on).

const TONE_OF: Record<ProjectTone, Tone> = { bad: 'bad', warn: 'warn', ok: 'ok' }
const ROLE: Record<string, string> = { pm: 'PM', supervisor: 'Supervisor', crew: 'Crew' }

function promiseLine(p: ProjectCard): string {
  if (!p.promised || p.promiseIn === null) return ''
  const when = p.promiseIn < 0 ? `was ${dayShort(p.promised)}` : p.promiseIn === 0 ? 'today' : p.promiseIn === 1 ? 'tomorrow' : dayShort(p.promised)
  return `Promised ${when}${p.promiseNote ? `: ${p.promiseNote}` : ''}`
}

function Project({ p, money, day, can, onChange }: { p: ProjectCard; money: boolean; day: string; can: Data['can']; onChange: () => void }) {
  const promise = promiseLine(p)
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-snug text-[var(--color-charcoal)]">{p.name}</h3>
          {p.address ? <p className="truncate text-[12px] text-[var(--color-charcoal-light)]">{p.address}</p> : null}
        </div>
        <Chip tone={TONE_OF[p.tone]}>
          <Dot tone={TONE_OF[p.tone]} />
          {p.headline}
        </Chip>
      </div>
      {promise ? <p className="mt-2 text-[13px] text-[var(--color-charcoal)]">{promise}</p> : null}

      <div className="mt-3">
        <StageStrip
          jobId={p.id}
          jobName={p.name}
          phases={p.phases}
          stage={p.stage}
          today={day}
          can={{ verify: can.verify, edit: can.phases, plan: can.plan }}
          act={async (input) => {
            const res = await postPhaseAct(input)
            if (res.ok) onChange()
            return res
          }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[
          ['Open', p.open],
          ['To check', p.toCheck.length],
          ['Verified', p.verified],
          ['Sent back', p.sentBack],
        ].map(([label, n]) => (
          <div key={label} className="rounded-lg bg-[var(--color-cream)] px-1 py-2">
            <dt className="text-[11px] text-[var(--color-charcoal-light)]">{label}</dt>
            <dd className="text-[17px] font-semibold text-[var(--color-charcoal)]">{n}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-[11px] text-[var(--color-charcoal-light)]">Verified and sent back: the last 14 days.</p>

      {p.stuck.length ? (
        <ul className="mt-3 space-y-1">
          {p.stuck.map((t) => (
            <li key={t.id} className="text-[13px] text-[var(--color-charcoal)]">
              <span className="font-medium">Stuck</span> · {t.who}: {t.title}
              {t.note ? ` (${t.note})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {p.toCheck.length ? (
        <p className="mt-2 text-[13px] text-[var(--color-charcoal)]">
          <span className="font-medium">To check:</span> {p.toCheck.map((t) => `${t.title} (${t.who})`).join('; ')}
        </p>
      ) : null}
      {p.cant.map((c) => (
        <p key={`${c.day}-${c.who}`} className="mt-2 text-[13px] text-[var(--color-charcoal)]">
          <span className="font-medium">{c.who} cannot make it</span> {dayShort(c.day)}
          {c.note ? `: ${c.note}` : ''}
        </p>
      ))}

      <p className="mt-3 text-[13px] text-[var(--color-charcoal)]">
        {p.today.length ? `Today: ${p.today.join(', ')}` : 'Nobody here today'}
        {p.next ? ` · Next: ${dayShort(p.next.day)}, ${p.next.names.join(', ')}` : ''}
      </p>
      <p className="mt-1 text-[12px] text-[var(--color-charcoal-light)]">
        {p.people.length ? p.people.map((x) => `${x.name} (${ROLE[x.role] ?? x.role})`).join(' · ') : 'Nobody assigned to this job yet.'}
      </p>
      {money ? <ProjectMoneySlot crewJobId={p.id} billingJobId={p.billingJobId} jobName={p.name} /> : null}
    </Card>
  )
}

export default function ProjectsView() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    botApi<Data>('/api/crew/projects')
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [attempt])
  const load = useCallback(() => {
    setError('')
    setAttempt((n) => n + 1)
  }, [])

  if (!data) {
    return error ? (
      <>
        <Empty>{error}</Empty>
        <Button full className="mt-3" onClick={load}>
          Try again
        </Button>
      </>
    ) : (
      <Empty>Loading…</Empty>
    )
  }
  return (
    <div className="space-y-3">
      {data.narrowed ? <p className="text-[13px] text-[var(--color-charcoal-light)]">The jobs you are on.</p> : null}
      {data.projects.length ? (
        data.projects.map((p) => <Project key={p.id} p={p} money={data.money} day={data.day} can={data.can} onChange={load} />)
      ) : (
        <Empty>{data.narrowed ? 'You are not on any job yet. Marco or Lando can add you to one.' : 'No active jobs.'}</Empty>
      )}
      <SectionTitle>Latest plans</SectionTitle>
      {data.plans.length ? (
        data.plans.map((r) => {
          const ask = planAsk(r.body)
          return (
            <Card key={r.id} className="p-4">
              <p className="text-[12px] text-[var(--color-charcoal-light)]">
                {r.sentName} · for {dayShort(r.day)}
              </p>
              <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-[var(--color-charcoal)]">{r.body.split('\n').slice(0, 8).join('\n')}</p>
              {ask ? (
                <p className="mt-2 text-[13px] text-[var(--color-charcoal)]">
                  <span className="font-medium">Asked:</span> {ask}
                  {r.answer ? ` · ${r.answer.name}: ${r.answer.text}` : ' · not answered yet'}
                </p>
              ) : null}
            </Card>
          )
        })
      ) : (
        <Empty>No plans in the last two weeks.</Empty>
      )}
    </div>
  )
}
