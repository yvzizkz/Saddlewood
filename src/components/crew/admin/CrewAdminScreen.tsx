'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Plus, Share2, X } from 'lucide-react'

import { useBot } from '@/components/bot/BotProvider'
import { Button, Card, Chip, Dot, Empty, ScreenTitle, SectionTitle, Segmented } from '@/components/bot/ui'
import { ago } from '@/lib/bot/view'
import { addDays, clock12, clockText, dayLabel, dayShort, hoursText, localInstant, weekDays, weekStart, workedMinutes } from '@/lib/crew/time'
import { firstNameOf, type CrewAdminHome, type CrewEntry, type CrewJob, type CrewPerson, type CrewShift, type CrewTask } from '@/lib/crew/types'
import {
  AskSheet,
  AssignSheet,
  EntryCard,
  FixSheet,
  JobSheet,
  PersonSheet,
  ShiftAddSheet,
  ShiftSheet,
  TaskAddSheet,
  TaskSheet,
} from './AdminSheets'
import { CrewAdminProvider, useCrewAdmin } from './useCrewAdmin'

// The owners' side of the crew, in four views:
//   Today     who is on the clock, what needs a decision, what came in from the field
//   Schedule  who is where, day by day (the dispatch)
//   Hours     the week's timesheet, corrections, the payroll export
//   Team      who has a seat, and the list of jobs

type View = 'today' | 'schedule' | 'hours' | 'team'

type Open =
  | { kind: 'assign'; day: string; preset?: { jobId: string; startTime: string; note: string } }
  | { kind: 'task-add'; to?: string }
  | { kind: 'task'; task: CrewTask }
  | { kind: 'ask'; to?: string }
  | { kind: 'shift'; shift: CrewShift }
  | { kind: 'shift-add'; day: string; email?: string }
  | { kind: 'fix'; entry: CrewEntry }
  | { kind: 'person'; person: CrewPerson | null }
  | { kind: 'job'; job: CrewJob | null; suggested?: string }
  | null

/** Re-render twice a minute so elapsed times keep counting. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function Row({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  if (!onClick) return <div className="px-4 py-3">{children}</div>
  return (
    <button type="button" onClick={onClick} className="block w-full px-4 py-3 text-left active:bg-[var(--color-cream)]">
      {children}
    </button>
  )
}

// ---- Today ------------------------------------------------------------------------

function TodayView({ data, show }: { data: CrewAdminHome; show: (o: Open) => void }) {
  const { nameOf, run } = useCrewAdmin()
  const now = useNow()
  const [range, setRange] = useState<'today' | 'week'>('today')

  const onClock = data.shifts.filter((s) => s.status === 'ok' && !s.endedAt)
  const todayShifts = data.shifts.filter((s) => s.status === 'ok' && s.day === data.day)
  const fixes = data.entries.filter((e) => e.kind === 'timefix' && e.status === 'new')
  const review = data.shifts.filter((s) => s.status === 'ok' && s.review)
  const cant = data.schedule.filter((s) => s.ack === 'cant' && s.day >= data.day)
  const blocked = data.tasks.filter((x) => x.status === 'blocked')
  const needs = fixes.length + review.length + cant.length + blocked.length

  const scheduledToday = data.schedule.filter((s) => s.day === data.day)
  const worked = new Set(todayShifts.map((s) => s.email))
  const missing = scheduledToday.filter((s) => !worked.has(s.email) && s.ack !== 'cant')

  const feed = data.entries.filter((e) => e.kind !== 'timefix' && (range === 'week' || e.day === data.day))
  const openQuestions = data.questions.filter((q) => q.status === 'open')
  const answered = data.questions.filter((q) => q.status === 'answered' && q.kind !== 'eod').slice(0, 8)
  const openTasks = data.tasks.filter((x) => x.status === 'open' || x.status === 'blocked')
  const doneTasks = data.tasks.filter((x) => x.status === 'done').slice(0, 5)
  const hasCrew = data.people.some((p) => p.active)

  if (!hasCrew) {
    return (
      <Empty>
        Nobody has a seat yet. Go to Team, add a job and a person, and send them the link. Once they clock in, you will see it here.
      </Empty>
    )
  }

  return (
    <>
      {needs ? (
        <>
          <SectionTitle count={needs}>Needs you</SectionTitle>
          <Card className="divide-y divide-[var(--color-stone)]">
            {fixes.map((e) => (
              <Row key={`fix-${e.id}`} onClick={() => show({ kind: 'fix', entry: e })}>
                <span className="block text-[15px] leading-snug text-[var(--color-charcoal)]">
                  {firstNameOf(nameOf(e.email))} asks to fix {dayShort(e.day)}
                </span>
                <span className="mt-0.5 block text-[12px] text-[var(--color-charcoal-light)]">
                  {clockText(String(e.data.start ?? ''))} – {clockText(String(e.data.end ?? ''))} · {e.body}
                </span>
              </Row>
            ))}
            {review.map((s) => (
              <Row key={`rev-${s.id}`} onClick={() => show({ kind: 'shift', shift: s })}>
                <span className="block text-[15px] leading-snug text-[var(--color-charcoal)]">
                  {firstNameOf(nameOf(s.email))}, {dayShort(s.day)}: {s.review}
                </span>
                <span className="mt-0.5 block text-[12px] text-[var(--color-charcoal-light)]">
                  {s.jobName} · {clock12(s.startedAt)} – {s.endedAt ? clock12(s.endedAt) : 'still on'}
                </span>
              </Row>
            ))}
            {cant.map((s) => (
              <Row key={`cant-${s.id}`}>
                <span className="block text-[15px] leading-snug text-[var(--color-charcoal)]">
                  {firstNameOf(nameOf(s.email))} cannot make {s.jobName}, {dayLabel(s.day, data.day).toLowerCase()}
                </span>
                {s.ackNote ? <span className="mt-0.5 block text-[12px] text-[var(--color-charcoal-light)]">{s.ackNote}</span> : null}
              </Row>
            ))}
            {blocked.map((x) => (
              <Row key={`blk-${x.id}`} onClick={() => show({ kind: 'task', task: x })}>
                <span className="block text-[15px] leading-snug text-[var(--color-charcoal)]">
                  {firstNameOf(nameOf(x.email))} is stuck: {x.title}
                </span>
                {x.doneNote ? <span className="mt-0.5 block text-[12px] text-[var(--color-charcoal-light)]">{x.doneNote}</span> : null}
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle count={onClock.length}>On the clock</SectionTitle>
      {onClock.length ? (
        <Card className="divide-y divide-[var(--color-stone)]">
          {onClock.map((s) => (
            <Row key={s.id} onClick={() => show({ kind: 'shift', shift: s })}>
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-[15px] text-[var(--color-charcoal)]">
                  <Dot tone="ok" />
                  <span className="truncate">{nameOf(s.email)}</span>
                </span>
                <span className="shrink-0 font-mono text-[13px] text-[var(--color-charcoal)]">{hoursText(workedMinutes(s, now))}</span>
              </span>
              <span className="mt-0.5 block pl-4 text-[12px] text-[var(--color-charcoal-light)]">
                {s.jobName} · since {clock12(s.startedAt)}
                {s.day !== data.day ? ` (${dayShort(s.day)})` : ''}
              </span>
            </Row>
          ))}
        </Card>
      ) : (
        <Empty>Nobody is on the clock right now.</Empty>
      )}

      {missing.length ? (
        <>
          <SectionTitle count={missing.length}>Scheduled, not clocked in</SectionTitle>
          <Card className="divide-y divide-[var(--color-stone)]">
            {missing.map((s) => {
              const late = !!s.startTime && now > localInstant(s.day, s.startTime).getTime() + 15 * 60_000
              return (
                <Row key={s.id}>
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-[15px] text-[var(--color-charcoal)]">{nameOf(s.email)}</span>
                    {late ? <Chip tone="bad">Late</Chip> : s.ack === 'ok' ? <Chip tone="ok">Said got it</Chip> : <Chip tone="quiet">Not seen yet</Chip>}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[var(--color-charcoal-light)]">
                    {s.jobName}
                    {s.startTime ? ` · ${clockText(s.startTime)}` : ''}
                  </span>
                </Row>
              )
            })}
          </Card>
        </>
      ) : null}

      {todayShifts.some((s) => s.endedAt) ? (
        <>
          <SectionTitle>Done for the day</SectionTitle>
          <Card className="divide-y divide-[var(--color-stone)]">
            {todayShifts
              .filter((s) => s.endedAt)
              .map((s) => (
                <Row key={s.id} onClick={() => show({ kind: 'shift', shift: s })}>
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate text-[15px] text-[var(--color-charcoal)]">{nameOf(s.email)}</span>
                    <span className="shrink-0 font-mono text-[13px] text-[var(--color-charcoal)]">{hoursText(workedMinutes(s))}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[var(--color-charcoal-light)]">
                    {s.jobName} · {clock12(s.startedAt)} – {clock12(s.endedAt)}
                  </span>
                </Row>
              ))}
          </Card>
        </>
      ) : null}

      <SectionTitle
        action={
          <button type="button" className="min-h-9 text-[12px] font-medium text-[var(--color-teal)] underline" onClick={() => setRange(range === 'today' ? 'week' : 'today')}>
            {range === 'today' ? 'Show the last 7 days' : 'Show today only'}
          </button>
        }
      >
        From the field
      </SectionTitle>
      {feed.length ? (
        <Card className="divide-y divide-[var(--color-stone)]">
          {feed.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </Card>
      ) : (
        <Empty>Nothing has come in {range === 'today' ? 'today' : 'this week'}.</Empty>
      )}

      <SectionTitle
        count={openTasks.length}
        action={
          <Button className="min-h-9 px-3 text-[13px]" onClick={() => show({ kind: 'task-add' })}>
            <Plus className="size-4" aria-hidden="true" /> Task
          </Button>
        }
      >
        Tasks out
      </SectionTitle>
      {openTasks.length || doneTasks.length ? (
        <Card className="divide-y divide-[var(--color-stone)]">
          {[...openTasks, ...doneTasks].map((x) => (
            <Row key={x.id} onClick={() => show({ kind: 'task', task: x })}>
              <span className={`block text-[15px] leading-snug text-[var(--color-charcoal)] ${x.status === 'done' ? 'line-through opacity-60' : ''}`}>{x.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-charcoal-light)]">
                {x.status === 'blocked' ? <Chip tone="bad">Stuck</Chip> : x.status === 'done' ? <Chip tone="ok">Done</Chip> : null}
                {firstNameOf(nameOf(x.email))}
                {x.jobName ? ` · ${x.jobName}` : ''}
                {x.due ? ` · due ${dayShort(x.due)}` : ''}
              </span>
            </Row>
          ))}
        </Card>
      ) : (
        <Empty>No tasks are out.</Empty>
      )}

      <SectionTitle
        count={openQuestions.length}
        action={
          <Button className="min-h-9 px-3 text-[13px]" onClick={() => show({ kind: 'ask' })}>
            <Plus className="size-4" aria-hidden="true" /> Question
          </Button>
        }
      >
        Questions out
      </SectionTitle>
      {openQuestions.length || answered.length ? (
        <Card className="divide-y divide-[var(--color-stone)]">
          {openQuestions.map((q) => (
            <div key={q.id} className="flex items-start justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[15px] leading-snug text-[var(--color-charcoal)]">{q.body}</p>
                <p className="mt-0.5 text-[12px] text-[var(--color-charcoal-light)]">
                  To {firstNameOf(nameOf(q.email))} · {q.askedBy === 'bot' ? 'the bot asked' : 'you asked'} {ago(q.createdAt)} · no answer yet
                </p>
              </div>
              <button
                type="button"
                aria-label="Take the question back"
                onClick={() => void run({ kind: 'question.cancel', id: q.id }, true)}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--color-charcoal-light)] active:bg-[var(--color-cream)]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          {answered.map((q) => (
            <div key={q.id} className="px-4 py-3">
              <p className="text-[13px] leading-snug text-[var(--color-charcoal-light)]">{q.body}</p>
              <p className="mt-0.5 text-[15px] leading-snug text-[var(--color-charcoal)]">
                <span className="font-medium">{firstNameOf(nameOf(q.email))}:</span>{' '}
                {q.options.find((o) => o.v === q.answer)?.en ?? (q.kind === 'clockout' && q.answer !== 'still' ? `left at ${clockText(q.answer)}` : q.answer)}
              </p>
            </div>
          ))}
        </Card>
      ) : (
        <Empty>No questions are out. The bot asks when something is missing: a clock-out, an amount on a receipt, the end-of-day check-in.</Empty>
      )}
    </>
  )
}

// ---- Schedule ---------------------------------------------------------------------

function ScheduleView({ data, show }: { data: CrewAdminHome; show: (o: Open) => void }) {
  const { nameOf, run } = useCrewAdmin()
  const [day, setDay] = useState(addDays(data.day, 1))
  const days = Array.from({ length: 8 }, (_, i) => addDays(data.day, i))
  const rows = data.schedule.filter((s) => s.day === day)
  const active = data.people.filter((p) => p.active)
  const placed = new Set(rows.map((r) => r.email))
  const free = active.filter((p) => !placed.has(p.email))
  const before = data.schedule.filter((s) => s.day === addDays(day, -1))

  const byJob = new Map<string, typeof rows>()
  for (const r of rows) byJob.set(r.jobId, [...(byJob.get(r.jobId) ?? []), r])

  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {days.map((d) => {
          const count = data.schedule.filter((s) => s.day === d).length
          const on = d === day
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => setDay(d)}
              className={`flex min-h-12 shrink-0 flex-col items-center justify-center rounded-xl border px-3.5 text-[13px] font-medium ${
                on ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]'
              }`}
            >
              {dayLabel(d, data.day)}
              <span className={`text-[11px] font-normal ${on ? 'text-white/80' : 'text-[var(--color-charcoal-light)]'}`}>{count ? `${count} on` : 'nobody yet'}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 space-y-3">
        {[...byJob.entries()].map(([jobId, items]) => (
          <Card key={jobId} className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[17px] leading-snug text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
                  {items[0].jobName}
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--color-charcoal-light)]">{items[0].startTime ? `Start ${clockText(items[0].startTime)}` : 'No set time'}</p>
              </div>
              <Button
                className="min-h-9 shrink-0 px-3 text-[13px]"
                onClick={() => show({ kind: 'assign', day, preset: { jobId, startTime: items[0].startTime, note: items[0].note } })}
              >
                <Plus className="size-4" aria-hidden="true" /> Add
              </Button>
            </div>
            {items[0].note ? <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-charcoal)]">{items[0].note}</p> : null}
            <ul className="mt-3 space-y-1.5">
              {items.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[15px] text-[var(--color-charcoal)]">
                    {nameOf(r.email)}
                    {r.ack === 'ok' ? <Chip tone="ok">Got it</Chip> : r.ack === 'cant' ? <Chip tone="bad">Cannot make it</Chip> : null}
                    {r.startTime !== items[0].startTime && r.startTime ? <Chip tone="quiet">{clockText(r.startTime)}</Chip> : null}
                  </span>
                  <button
                    type="button"
                    aria-label={`Take ${nameOf(r.email)} off`}
                    onClick={() => void run({ kind: 'schedule.remove', id: r.id }, true)}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--color-charcoal-light)] active:bg-[var(--color-cream)]"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {items.some((r) => r.ack === 'cant' && r.ackNote) ? (
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">
                {items
                  .filter((r) => r.ack === 'cant' && r.ackNote)
                  .map((r) => `${firstNameOf(nameOf(r.email))}: ${r.ackNote}`)
                  .join(' · ')}
              </p>
            ) : null}
          </Card>
        ))}
      </div>

      {!rows.length ? <Empty>Nobody is scheduled for {dayLabel(day, data.day).toLowerCase()} yet.</Empty> : null}

      <div className="mt-4 grid gap-2.5">
        <Button variant="primary" full onClick={() => show({ kind: 'assign', day })} className="min-h-12">
          <Plus className="size-4" aria-hidden="true" /> Put people on a job
        </Button>
        {!rows.length && before.length ? (
          <Button full onClick={() => void run({ kind: 'schedule.copy', from: addDays(day, -1), to: day })}>
            Same as {dayLabel(addDays(day, -1), data.day).toLowerCase()} ({before.length})
          </Button>
        ) : null}
      </div>

      {free.length && rows.length ? (
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--color-charcoal-light)]">
          Not scheduled {dayLabel(day, data.day).toLowerCase()}: {free.map((p) => firstNameOf(p.name)).join(', ')}.
        </p>
      ) : null}
      <p className="mt-4 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">
        Each person sees their job, the start time and your note in their app. A change for today or tomorrow buzzes their phone at once; the rest goes out the evening before.
      </p>
    </>
  )
}

// ---- Hours ------------------------------------------------------------------------

function HoursView({ data, show }: { data: CrewAdminHome; show: (o: Open) => void }) {
  const { setWeek, nameOf } = useCrewAdmin()
  const [openPerson, setOpenPerson] = useState<string | null>(null)
  const days = weekDays(data.week)
  const thisWeek = weekStart(data.day)
  const inWeek = data.shifts.filter((s) => s.status === 'ok' && s.day >= days[0] && s.day <= days[6])
  const emails = [...new Set(inWeek.map((s) => s.email))].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  const total = inWeek.reduce((sum, s) => sum + workedMinutes(s), 0)

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Button aria-label="The week before" className="px-3" onClick={() => setWeek(addDays(data.week, -7))}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <p className="text-center text-[15px] font-medium text-[var(--color-charcoal)]">
          {dayShort(days[0])} – {dayShort(days[6])}
          <span className="block text-[12px] font-normal text-[var(--color-charcoal-light)]">
            {data.week === thisWeek ? 'This week' : data.week === addDays(thisWeek, -7) ? 'Last week' : ''}
          </span>
        </p>
        <Button aria-label="The week after" className="px-3" disabled={data.week >= thisWeek} onClick={() => setWeek(addDays(data.week, 7))}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <Card className="mt-4 flex items-baseline justify-between px-4 py-3.5">
        <span className="text-[13px] text-[var(--color-charcoal-light)]">
          {emails.length} {emails.length === 1 ? 'person' : 'people'}
        </span>
        <span className="text-2xl text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          {hoursText(total)}
        </span>
      </Card>

      {emails.length ? (
        <div className="mt-3 space-y-3">
          {emails.map((email) => {
            const mine = inWeek.filter((s) => s.email === email)
            const minutes = mine.reduce((sum, s) => sum + workedMinutes(s), 0)
            const flagged = mine.some((s) => s.review || !s.endedAt)
            const expanded = openPerson === email
            return (
              <Card key={email} className="overflow-hidden">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpenPerson(expanded ? null : email)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-[var(--color-cream)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-[var(--color-charcoal)]">{nameOf(email)}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {days.map((d) => {
                        const m = mine.filter((s) => s.day === d).reduce((sum, s) => sum + workedMinutes(s), 0)
                        return m ? (
                          <span key={d} className="rounded bg-[var(--color-cream)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-charcoal)]">
                            {dayShort(d).slice(0, 2)} {(m / 60).toFixed(1)}
                          </span>
                        ) : null
                      })}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {flagged ? <Dot tone="warn" /> : null}
                    <span className="font-mono text-[15px] text-[var(--color-charcoal)]">{hoursText(minutes)}</span>
                  </span>
                </button>
                {expanded ? (
                  <div className="divide-y divide-[var(--color-stone)] border-t border-[var(--color-stone)]">
                    {mine.map((s) => (
                      <Row key={s.id} onClick={() => show({ kind: 'shift', shift: s })}>
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-[14px] text-[var(--color-charcoal)]">
                            {dayShort(s.day)} · {clock12(s.startedAt)} – {s.endedAt ? clock12(s.endedAt) : 'still on'}
                          </span>
                          <span className="shrink-0 font-mono text-[13px] text-[var(--color-charcoal)]">{hoursText(workedMinutes(s))}</span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-charcoal-light)]">
                          {s.jobName}
                          {s.endedAt && s.breakMin ? ` · ${s.breakMin} min break` : ''}
                          {s.review ? <Chip tone="warn">{s.review}</Chip> : null}
                          {s.edits.length ? <Chip tone="quiet">Changed by {s.edits[s.edits.length - 1].by}</Chip> : null}
                          {s.source === 'office' ? <Chip tone="quiet">Entered by the office</Chip> : null}
                        </span>
                      </Row>
                    ))}
                    <div className="px-4 py-2.5">
                      <Button className="min-h-9 px-3 text-[13px]" onClick={() => show({ kind: 'shift-add', day: data.week <= data.day && data.day <= days[6] ? data.day : days[0], email })}>
                        <Plus className="size-4" aria-hidden="true" /> Enter a shift for {firstNameOf(nameOf(email))}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="mt-3">
          <Empty>No hours this week.</Empty>
        </div>
      )}

      <div className="mt-4 grid gap-2.5">
        <a
          href={`/api/crew/admin/export?from=${days[0]}&to=${days[6]}`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--color-teal)] bg-[var(--color-teal)] px-4 text-sm font-medium text-white"
        >
          <Download className="size-4" aria-hidden="true" /> Download this week for payroll
        </a>
        <Button full onClick={() => show({ kind: 'shift-add', day: data.week === thisWeek ? data.day : days[0] })}>
          <Plus className="size-4" aria-hidden="true" /> Enter a shift by hand
        </Button>
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">
        Hours are time on the clock less the unpaid break. The week runs Monday to Sunday. Nobody can change their own times: they ask, and you decide. Every change keeps what it said before and who changed it.
      </p>
    </>
  )
}

// ---- Team -------------------------------------------------------------------------

function TeamView({ data, show }: { data: CrewAdminHome; show: (o: Open) => void }) {
  const { toast } = useBot()
  const link = typeof window === 'undefined' ? '/app' : `${window.location.origin}/app`

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: 'Saddlewood app', text: 'The Saddlewood app. Sign in with your email.', url: link })
      else {
        await navigator.clipboard.writeText(link)
        toast('Link copied.', 'ok')
      }
    } catch {
      // closed the share sheet
    }
  }

  const activeJobs = data.jobs.filter((j) => j.active)
  const oldJobs = data.jobs.filter((j) => !j.active)

  return (
    <>
      <SectionTitle
        count={data.people.filter((p) => p.active).length}
        action={
          <Button className="min-h-9 px-3 text-[13px]" onClick={() => show({ kind: 'person', person: null })}>
            <Plus className="size-4" aria-hidden="true" /> Person
          </Button>
        }
      >
        Crew
      </SectionTitle>
      {data.people.length ? (
        <Card className="divide-y divide-[var(--color-stone)]">
          {data.people.map((p) => (
            <Row key={p.email} onClick={() => show({ kind: 'person', person: p })}>
              <span className="flex items-center justify-between gap-3">
                <span className={`truncate text-[15px] text-[var(--color-charcoal)] ${p.active ? '' : 'opacity-50'}`}>{p.name}</span>
                {!p.active ? <Chip tone="bad">No seat</Chip> : p.lastSeenAt ? <Chip tone="ok">In the app</Chip> : <Chip tone="warn">Not in yet</Chip>}
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-[var(--color-charcoal-light)]">
                {[p.trade, p.lang === 'es' ? 'Español' : 'English', p.email, p.lastSeenAt ? `opened ${ago(p.lastSeenAt)}` : ''].filter(Boolean).join(' · ')}
              </span>
            </Row>
          ))}
        </Card>
      ) : (
        <Empty>Nobody yet. Add a person and they get a link to the app by email.</Empty>
      )}
      <Button full className="mt-2.5" onClick={share}>
        <Share2 className="size-4" aria-hidden="true" /> Share the app link
      </Button>
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">
        The link is the same for everyone: {link.replace(/^https?:\/\//, '')}. It only opens for someone on this list.
      </p>

      <SectionTitle
        count={activeJobs.length}
        action={
          <Button className="min-h-9 px-3 text-[13px]" onClick={() => show({ kind: 'job', job: null })}>
            <Plus className="size-4" aria-hidden="true" /> Job
          </Button>
        }
      >
        Jobs
      </SectionTitle>
      {activeJobs.length ? (
        <Card className="divide-y divide-[var(--color-stone)]">
          {activeJobs.map((j) => (
            <Row key={j.id} onClick={() => show({ kind: 'job', job: j })}>
              <span className="block text-[15px] text-[var(--color-charcoal)]">{j.name}</span>
              <span className="mt-0.5 block truncate text-[12px] text-[var(--color-charcoal-light)]">{j.address || 'No address yet'}</span>
            </Row>
          ))}
        </Card>
      ) : (
        <Empty>No jobs yet. The crew clocks in to a job, and receipts are filed under it.</Empty>
      )}
      {data.suggestedJobs.length ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] text-[var(--color-charcoal-light)]">From the expense tracker. Tap to add:</p>
          <div className="flex flex-wrap gap-2">
            {data.suggestedJobs.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => show({ kind: 'job', job: null, suggested: name })}
                className="min-h-9 rounded-full border border-dashed border-[var(--color-stone-mid)] bg-white px-3 text-[13px] text-[var(--color-charcoal)]"
              >
                + {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {oldJobs.length ? (
        <details className="mt-3">
          <summary className="min-h-9 cursor-pointer text-[13px] text-[var(--color-charcoal-light)]">Finished jobs ({oldJobs.length})</summary>
          <Card className="mt-1.5 divide-y divide-[var(--color-stone)]">
            {oldJobs.map((j) => (
              <Row key={j.id} onClick={() => show({ kind: 'job', job: j })}>
                <span className="block text-[15px] text-[var(--color-charcoal)] opacity-60">{j.name}</span>
              </Row>
            ))}
          </Card>
        </details>
      ) : null}
    </>
  )
}

// ---- the screen -------------------------------------------------------------------

function Screen() {
  const { data, error, refresh } = useCrewAdmin()
  const { home } = useBot()
  const [view, setView] = useState<View>('today')
  const [open, setOpen] = useState<Open>(null)
  const [sheetKey, setSheetKey] = useState(0)

  function show(next: Open) {
    setSheetKey((k) => k + 1)
    setOpen(next)
  }
  const close = () => setOpen(null)

  if (home && home.me.role !== 'owner') {
    return (
      <div className="px-4 pt-6">
        <ScreenTitle title="Crew" />
        <Empty>This part of the app is for Lando, Marco and Ilene.</Empty>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="px-4 pt-6">
        <ScreenTitle title="Crew" />
        {error ? (
          <>
            <Empty>{error}</Empty>
            <Button full className="mt-3" onClick={() => void refresh()}>
              Try again
            </Button>
          </>
        ) : (
          <Empty>Loading…</Empty>
        )}
      </div>
    )
  }

  const needs =
    data.entries.filter((e) => e.kind === 'timefix' && e.status === 'new').length +
    data.shifts.filter((s) => s.status === 'ok' && s.review).length +
    data.tasks.filter((x) => x.status === 'blocked').length

  return (
    <div className="px-4 pb-8 pt-6">
      <ScreenTitle eyebrow={dayShort(data.day)} title="Crew" />
      <Segmented
        label="Crew views"
        value={view}
        onChange={setView}
        options={[
          { value: 'today', label: 'Today', count: needs },
          { value: 'schedule', label: 'Schedule' },
          { value: 'hours', label: 'Hours' },
          { value: 'team', label: 'Team' },
        ]}
      />
      <div className="mt-5">
        {view === 'today' ? <TodayView data={data} show={show} /> : null}
        {view === 'schedule' ? <ScheduleView data={data} show={show} /> : null}
        {view === 'hours' ? <HoursView data={data} show={show} /> : null}
        {view === 'team' ? <TeamView data={data} show={show} /> : null}
      </div>

      {open?.kind === 'assign' ? <AssignSheet key={sheetKey} day={open.day} preset={open.preset} onClose={close} /> : null}
      {open?.kind === 'task-add' ? <TaskAddSheet key={sheetKey} to={open.to} onClose={close} /> : null}
      {open?.kind === 'task' ? <TaskSheet key={sheetKey} task={open.task} onClose={close} /> : null}
      {open?.kind === 'ask' ? <AskSheet key={sheetKey} to={open.to} onClose={close} /> : null}
      {open?.kind === 'shift' ? <ShiftSheet key={sheetKey} shift={open.shift} onClose={close} /> : null}
      {open?.kind === 'shift-add' ? <ShiftAddSheet key={sheetKey} day={open.day} email={open.email} onClose={close} /> : null}
      {open?.kind === 'fix' ? <FixSheet key={sheetKey} entry={open.entry} onClose={close} /> : null}
      {open?.kind === 'person' ? <PersonSheet key={sheetKey} person={open.person} onClose={close} /> : null}
      {open?.kind === 'job' ? <JobSheet key={sheetKey} job={open.job} suggested={open.suggested} onClose={close} /> : null}
    </div>
  )
}

export default function CrewAdminScreen() {
  return (
    <CrewAdminProvider>
      <Screen />
    </CrewAdminProvider>
  )
}
