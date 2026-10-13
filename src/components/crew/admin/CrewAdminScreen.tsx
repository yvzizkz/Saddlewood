'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, Package, Plus, Send, Share2, X } from 'lucide-react'

import { useBot } from '@/components/bot/BotProvider'
import { Button, Card, Chip, Dot, Empty, INPUT, ScreenTitle, SectionTitle, Segmented } from '@/components/bot/ui'
import ProjectsView from '@/components/projects/ProjectsView'
import { useCrew } from '@/components/crew/CrewProvider'
import { ago } from '@/lib/bot/view'
import { buildPlan, planAsk, taskStatusWord } from '@/lib/crew/plan'
import { addDays, clock12, clockText, dayLabel, dayShort, hoursText, localDay, localInstant, weekDays, weekStart, workedMinutes } from '@/lib/crew/time'
import {
  firstNameOf,
  isReportedDone,
  type CrewAdminHome,
  type CrewEntry,
  type CrewGroup,
  type CrewJob,
  type CrewPerson,
  type CrewPickup,
  type CrewShift,
  type CrewTask,
} from '@/lib/crew/types'
import {
  AskSheet,
  AssignSheet,
  EntryCard,
  FixSheet,
  GroupSheet,
  JobSheet,
  PICKUP_STATUS,
  PersonSheet,
  PickupAddSheet,
  PickupSheet,
  PriorityChip,
  ShiftAddSheet,
  ShiftSheet,
  TaskAddSheet,
  TaskSheet,
} from './AdminSheets'
import { CrewAdminProvider, useCrewAdmin } from './useCrewAdmin'

// The Crew screens. Owners get five views, the lead (field supervisor) four:
//   Today     who is on the clock, what needs a decision or a check, what came in from the field
//   Schedule  who is where, day by day, in priority order; the jobs and what we promised
//   Runner    pickups staged for will-call (lead)
//   Plan      tomorrow's plan, sent to Marco in the evening; the record of plans sent
//   Hours     the week's timesheet, corrections, the payroll export (owners)
//   Team      who has a seat, and the list of jobs (owners)

const VIEWS = ['today', 'projects', 'schedule', 'runner', 'plan', 'hours', 'team'] as const
type View = (typeof VIEWS)[number]

type Open =
  | { kind: 'assign'; day: string; preset?: { jobId: string; startTime: string; note: string; priority?: number | null } }
  | { kind: 'pickup-add'; day: string }
  | { kind: 'pickup'; pickup: CrewPickup }
  | { kind: 'group'; group: CrewGroup | null }
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
  const { nameOf, run, can } = useCrewAdmin()
  const now = useNow()
  const [range, setRange] = useState<'today' | 'week'>('today')
  // Hours stay with the owners: the lead sees who is on, not the timesheet.
  const openShiftSheet = (s: CrewShift) => (can('hours.edit') ? () => show({ kind: 'shift', shift: s }) : undefined)

  const onClock = data.shifts.filter((s) => s.status === 'ok' && !s.endedAt)
  const todayShifts = data.shifts.filter((s) => s.status === 'ok' && s.day === data.day)
  const fixes = data.entries.filter((e) => e.kind === 'timefix' && e.status === 'new')
  const review = can('hours.edit') ? data.shifts.filter((s) => s.status === 'ok' && s.review) : []
  const cant = data.schedule.filter((s) => s.ack === 'cant' && s.day >= data.day)
  const blocked = data.tasks.filter((x) => x.status === 'blocked')
  // Your own work is checked by someone else (an owner), so it is never yours to check.
  const toCheck = data.tasks.filter((x) => isReportedDone(x) && x.email !== data.viewer.email)
  const needs = fixes.length + review.length + cant.length + blocked.length + toCheck.length

  const scheduledToday = data.schedule.filter((s) => s.day === data.day)
  const worked = new Set(todayShifts.map((s) => s.email))
  const missing = scheduledToday.filter((s) => !worked.has(s.email) && s.ack !== 'cant')

  const feed = data.entries.filter((e) => e.kind !== 'timefix' && (range === 'week' || e.day === data.day))
  const openQuestions = data.questions.filter((q) => q.status === 'open')
  const answered = data.questions.filter((q) => q.status === 'answered' && q.kind !== 'eod').slice(0, 8)
  const openTasks = data.tasks
    .filter((x) => x.status === 'open' || x.status === 'doing' || x.status === 'blocked' || isReportedDone(x))
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
  const doneTasks = data.tasks.filter((x) => x.status === 'done' && x.verifiedAt).slice(0, 5)
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
            {toCheck.map((x) => (
              <Row key={`chk-${x.id}`} onClick={() => show({ kind: 'task', task: x })}>
                <span className="flex items-start justify-between gap-2">
                  <span className="block text-[15px] leading-snug text-[var(--color-charcoal)]">
                    {firstNameOf(nameOf(x.email))} says done: {x.title}
                  </span>
                  <Chip tone="warn">Check it</Chip>
                </span>
                <span className="mt-0.5 block text-[12px] text-[var(--color-charcoal-light)]">
                  {[x.jobName, x.reportedAt ? clock12(x.reportedAt) : '', x.files.length ? `${x.files.length} photo${x.files.length === 1 ? '' : 's'}` : 'no photo'].filter(Boolean).join(' · ')}
                </span>
              </Row>
            ))}
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
            <Row key={s.id} onClick={openShiftSheet(s)}>
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
                <Row key={s.id} onClick={openShiftSheet(s)}>
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
          can('tasks.assign') ? (
            <Button className="min-h-9 px-3 text-[13px]" onClick={() => show({ kind: 'task-add' })}>
              <Plus className="size-4" aria-hidden="true" /> Task
            </Button>
          ) : undefined
        }
      >
        Tasks out
      </SectionTitle>
      {openTasks.length || doneTasks.length ? (
        <Card className="divide-y divide-[var(--color-stone)]">
          {[...openTasks, ...doneTasks].map((x) => (
            <Row key={x.id} onClick={() => show({ kind: 'task', task: x })}>
              <span className={`block text-[15px] leading-snug text-[var(--color-charcoal)] ${x.status === 'done' && x.verifiedAt ? 'line-through opacity-60' : ''}`}>{x.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-charcoal-light)]">
                <Chip tone={x.status === 'blocked' ? 'bad' : isReportedDone(x) ? 'warn' : x.status === 'done' ? 'ok' : 'quiet'}>
                  {x.status === 'blocked' ? 'Waiting' : taskStatusWord(x)}
                </Chip>
                <PriorityChip n={x.priority} />
                {x.sentBack ? <Chip tone="warn">Sent back</Chip> : null}
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
          can('questions.ask') ? (
            <Button className="min-h-9 px-3 text-[13px]" onClick={() => show({ kind: 'ask' })}>
              <Plus className="size-4" aria-hidden="true" /> Question
            </Button>
          ) : undefined
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
  const { nameOf, run, can } = useCrewAdmin()
  const edit = can('schedule.edit')
  const editJobs = can('jobs.promise') || can('jobs.manage')
  const [day, setDay] = useState(addDays(data.day, 1))
  const days = Array.from({ length: 8 }, (_, i) => addDays(data.day, i))
  const rows = data.schedule.filter((s) => s.day === day)
  const active = data.people.filter((p) => p.active)
  const placed = new Set(rows.map((r) => r.email))
  const free = active.filter((p) => !placed.has(p.email))
  const before = data.schedule.filter((s) => s.day === addDays(day, -1))

  const byJob = new Map<string, typeof rows>()
  for (const r of rows) byJob.set(r.jobId, [...(byJob.get(r.jobId) ?? []), r])
  // The top of the list goes first: the job with the most pressing assignment leads.
  const top = (items: typeof rows) => Math.min(...items.map((r) => r.priority ?? 9))
  const jobsInOrder = [...byJob.entries()].sort((a, b) => top(a[1]) - top(b[1]))
  const unset = rows.filter((r) => !r.priority).length
  const jobOf = (id: string) => data.jobs.find((j) => j.id === id)
  const promises = data.jobs
    .filter((j) => j.active)
    .sort((a, b) => (a.promised ?? '9999').localeCompare(b.promised ?? '9999') || a.name.localeCompare(b.name))

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
        {jobsInOrder.map(([jobId, items]) => (
          <Card key={jobId} className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[17px] leading-snug text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
                  {items[0].jobName}
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--color-charcoal-light)]">{items[0].startTime ? `Start ${clockText(items[0].startTime)}` : 'No set time'}</p>
                {jobOf(jobId)?.promised ? (
                  <p className="mt-0.5 text-[12px]" style={{ color: 'var(--color-gold-accessible)' }}>
                    Promised: {jobOf(jobId)?.promiseNote || 'done'} by {dayShort(jobOf(jobId)?.promised as string)}
                  </p>
                ) : null}
              </div>
              {edit ? (
                <Button
                  className="min-h-9 shrink-0 px-3 text-[13px]"
                  onClick={() => show({ kind: 'assign', day, preset: { jobId, startTime: items[0].startTime, note: items[0].note, priority: items[0].priority } })}
                >
                  <Plus className="size-4" aria-hidden="true" /> Add
                </Button>
              ) : null}
            </div>
            {items[0].note ? <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-charcoal)]">{items[0].note}</p> : null}
            <ul className="mt-3 space-y-1.5">
              {items.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[15px] text-[var(--color-charcoal)]">
                    {nameOf(r.email)}
                    {r.priority ? <PriorityChip n={r.priority} /> : <Chip tone="warn">No priority</Chip>}
                    {r.ack === 'ok' ? <Chip tone="ok">Got it</Chip> : r.ack === 'cant' ? <Chip tone="bad">Cannot make it</Chip> : null}
                    {r.startTime !== items[0].startTime && r.startTime ? <Chip tone="quiet">{clockText(r.startTime)}</Chip> : null}
                  </span>
                  {edit ? (
                    <button
                      type="button"
                      aria-label={`Take ${nameOf(r.email)} off`}
                      onClick={() => void run({ kind: 'schedule.remove', id: r.id }, true)}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--color-charcoal-light)] active:bg-[var(--color-cream)]"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
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
      {unset ? (
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: 'var(--color-gold-accessible)' }}>
          {unset} {unset === 1 ? 'assignment has' : 'assignments have'} no priority. Tap Add on the job to set it.
        </p>
      ) : null}

      <div className="mt-4 grid gap-2.5">
        {edit ? (
          <Button variant="primary" full onClick={() => show({ kind: 'assign', day })} className="min-h-12">
            <Plus className="size-4" aria-hidden="true" /> Put people on a job
          </Button>
        ) : null}
        {edit && !rows.length && before.length ? (
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

      <SectionTitle count={promises.filter((j) => j.promised).length}>Jobs and what we promised</SectionTitle>
      {promises.length ? (
        <Card className="divide-y divide-[var(--color-stone)]">
          {promises.map((j) => {
            const late = !!j.promised && j.promised < data.day
            const soon = !!j.promised && !late && j.promised <= addDays(data.day, 3)
            return (
              <Row key={j.id} onClick={editJobs ? () => show({ kind: 'job', job: j }) : undefined}>
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-[15px] text-[var(--color-charcoal)]">{j.name}</span>
                  {j.promised ? <Chip tone={late ? 'bad' : soon ? 'warn' : 'quiet'}>{dayShort(j.promised)}</Chip> : <Chip tone="quiet">No date</Chip>}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-[var(--color-charcoal-light)]">{j.promiseNote || 'Tap to add what we promised the client and by when.'}</span>
              </Row>
            )
          })}
        </Card>
      ) : (
        <Empty>No jobs yet.</Empty>
      )}
    </>
  )
}

// ---- Runner -----------------------------------------------------------------------

function RunnerView({ data, show }: { data: CrewAdminHome; show: (o: Open) => void }) {
  const { nameOf } = useCrewAdmin()
  const open = data.pickups
    .filter((p) => p.status === 'staged' || p.status === 'picked' || p.status === 'problem')
    .sort((a, b) => Number(b.status === 'problem') - Number(a.status === 'problem') || a.day.localeCompare(b.day))
  const done = data.pickups.filter((p) => p.status === 'delivered').slice(0, 12)
  const runners = data.people.filter((p) => p.active && p.perms.includes('pickups.run'))

  const line = (p: CrewPickup) => (
    <Row key={p.id} onClick={() => show({ kind: 'pickup', pickup: p })}>
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[15px] text-[var(--color-charcoal)]">
          <Package className="size-4 shrink-0 text-[var(--color-charcoal-light)]" aria-hidden="true" />
          <span className="truncate">{p.supplier}</span>
        </span>
        <Chip tone={PICKUP_STATUS[p.status].tone}>{PICKUP_STATUS[p.status].label}</Chip>
      </span>
      <span className="mt-0.5 block truncate pl-6 text-[12px] text-[var(--color-charcoal-light)]">
        {[dayLabel(p.day, data.day), p.orderRef ? `#${p.orderRef}` : '', p.jobName ? `to ${p.jobName}` : '', p.email ? firstNameOf(nameOf(p.email)) : 'any runner']
          .filter(Boolean)
          .join(' · ')}
      </span>
      {p.status === 'problem' && p.runnerNote ? <span className="mt-0.5 block pl-6 text-[12px] text-[#9a2a1f]">{p.runnerNote}</span> : null}
    </Row>
  )

  return (
    <>
      <Button variant="primary" full className="min-h-12" onClick={() => show({ kind: 'pickup-add', day: data.day })}>
        <Plus className="size-4" aria-hidden="true" /> Stage a pickup
      </Button>
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">
        Order it, have it staged for will-call, and put it here. The runner picks it up and brings it to the job, so you stay on site.
        {runners.length ? ` Runners: ${runners.map((p) => firstNameOf(p.name)).join(', ')}.` : ' Nobody is in a group with pickups switched on yet: an owner sets that under Team.'}
      </p>

      <SectionTitle count={open.length}>Waiting to be picked up or delivered</SectionTitle>
      {open.length ? <Card className="divide-y divide-[var(--color-stone)]">{open.map(line)}</Card> : <Empty>Nothing staged.</Empty>}

      {done.length ? (
        <>
          <SectionTitle>Delivered this week</SectionTitle>
          <Card className="divide-y divide-[var(--color-stone)]">{done.map(line)}</Card>
        </>
      ) : null}
    </>
  )
}

// ---- Plan -------------------------------------------------------------------------

/** A plan for `day` counts as on time when it was sent by 6 PM the evening before. */
function onTime(day: string, sentAt: string): boolean {
  const sent = localInstant(addDays(day, -1), '18:00').getTime()
  return Date.parse(sentAt) <= sent
}

function PlanView({ data }: { data: CrewAdminHome }) {
  const { run, isOwner, can } = useCrewAdmin()
  // A link can open a given day (/app/crew?view=plan&day=...), if it is one of the three shown.
  const askedDay = useSearchParams().get('day')
  const [day, setDay] = useState([0, 1, 2].some((i) => addDays(data.day, i) === askedDay) ? (askedDay as string) : addDays(data.day, 1))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState('')
  const [answering, setAnswering] = useState(false)
  const plan = buildPlan({ day, today: data.day, people: data.people, jobs: data.jobs, schedule: data.schedule, tasks: data.tasks, pickups: data.pickups, note })
  const sent = data.reports.filter((r) => r.day === day)
  const last = sent[0]

  // The record for the first 30 days: one plan per working day (Monday to Saturday), by 6 PM the
  // night before. It starts with the first plan ever sent: days before the routine existed are not misses.
  const start = data.reports.length ? data.reports.map((r) => r.day).sort()[0] : null
  const record = Array.from({ length: 30 }, (_, i) => addDays(data.day, -i))
    .filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() !== 0)
    .map((d) => {
      const first = data.reports.filter((r) => r.day === d).at(-1)
      const counts = !!start && d >= start && (!!first || d <= data.day)
      return { day: d, first, counts, ok: !!first && onTime(d, first.createdAt) }
    })
  const counted = record.filter((r) => r.counts)
  const hits = counted.filter((r) => r.ok).length

  async function send() {
    setBusy(true)
    const res = await run({ kind: 'report.send', day, note: note.trim() })
    setBusy(false)
    if (res.ok) setNote('')
  }

  const ask = last ? planAsk(last.body) : ''
  async function sendAnswer() {
    if (!last) return
    setAnswering(true)
    const res = await run({ kind: 'report.answer', id: last.id, text: answer.trim() })
    setAnswering(false)
    if (res.ok) setAnswer('')
  }

  return (
    <>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => {
          const d = addDays(data.day, i)
          const on = d === day
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => setDay(d)}
              className={`min-h-11 flex-1 rounded-xl border px-3 text-[13px] font-medium ${
                on ? 'border-[var(--color-teal)] bg-[var(--color-teal)] text-white' : 'border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]'
              }`}
            >
              {dayLabel(d, data.day)}
            </button>
          )
        })}
      </div>

      <Card className="mt-4 px-4 py-3.5">
        {last ? (
          <p className="flex flex-wrap items-center gap-1.5 text-[14px] text-[var(--color-charcoal)]">
            <Chip tone={onTime(day, last.createdAt) ? 'ok' : 'warn'}>{onTime(day, last.createdAt) ? 'Sent on time' : 'Sent late'}</Chip>
            {firstNameOf(last.sentName)} sent it {dayLabel(localDay(last.createdAt), data.day).toLowerCase()} at {clock12(last.createdAt)}
            {sent.length > 1 ? ` (${sent.length} times)` : ''}.
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-1.5 text-[14px] text-[var(--color-charcoal)]">
            <Chip tone="warn">Not sent yet</Chip>
            Due by 6:00 PM {dayLabel(addDays(day, -1), data.day).toLowerCase()}.
          </p>
        )}
        {plan.counts.unprioritized || plan.counts.toCheck ? (
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--color-gold-accessible)' }}>
            {[
              plan.counts.unprioritized ? `${plan.counts.unprioritized} on the schedule without a priority` : '',
              plan.counts.toCheck ? `${plan.counts.toCheck} reported done and not checked yet` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </Card>

      {last && ask ? (
        <>
          <SectionTitle>{firstNameOf(last.sentName)} asks</SectionTitle>
          <Card className="px-4 py-3.5">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-charcoal)]">{ask}</p>
            {last.answer ? (
              <div className="mt-3 border-t border-[var(--color-stone)] pt-3">
                <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-charcoal-light)]">
                  {firstNameOf(last.answer.name)} answered, {dayLabel(localDay(last.answer.at), data.day).toLowerCase()} at {clock12(last.answer.at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-charcoal)]">{last.answer.text}</p>
              </div>
            ) : isOwner ? (
              <div className="mt-3 space-y-2.5">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[var(--color-charcoal)]">Your answer</span>
                  <textarea className={`${INPUT} min-h-[64px] resize-y`} value={answer} maxLength={1000} onChange={(e) => setAnswer(e.target.value)} />
                </label>
                <Button variant="primary" full busy={answering} disabled={!answer.trim()} onClick={sendAnswer} className="min-h-12">
                  <Send className="size-4" aria-hidden="true" /> Send the answer to {firstNameOf(last.sentName)}
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-[var(--color-charcoal-light)]">Waiting on Marco&apos;s answer. Your phone will buzz when it comes.</p>
            )}
          </Card>
        </>
      ) : null}

      {isOwner && last ? (
        <>
          <SectionTitle>What {firstNameOf(last.sentName)} sent</SectionTitle>
          <Card className="px-4 py-3.5">
            <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-[var(--color-charcoal)]">{last.body}</pre>
          </Card>
        </>
      ) : null}

      {isOwner && last ? (
        <details className="mt-4">
          <summary className="min-h-9 cursor-pointer text-[13px] text-[var(--color-charcoal-light)]">The same plan as it stands right now</summary>
          <Card className="mt-1.5 px-4 py-3.5">
            <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-[var(--color-charcoal)]">{plan.text}</pre>
          </Card>
        </details>
      ) : (
        <>
          <SectionTitle>The plan</SectionTitle>
          <Card className="px-4 py-3.5">
            <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-[var(--color-charcoal)]">{plan.text}</pre>
          </Card>
        </>
      )}

      <div className="mt-4 space-y-2.5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[var(--color-charcoal)]">Need from Marco (decisions only)</span>
          <textarea className={`${INPUT} min-h-[64px] resize-y`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        </label>
        {can('plan.send') ? (
          <Button variant="primary" full busy={busy} onClick={send} className="min-h-12">
            <Send className="size-4" aria-hidden="true" /> {last ? 'Send the update to Marco' : 'Send the plan to Marco'}
          </Button>
        ) : null}
        <p className="text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">
          Marco gets a notification and reads it here. Every night by 6 PM for the first 30 days; then Marco decides if it can go weekly.
        </p>
      </div>

      <SectionTitle>The last 30 days</SectionTitle>
      <Card className="px-4 py-3.5">
        {counted.length ? (
          <p className="text-[15px] text-[var(--color-charcoal)]">
            <span className="text-2xl" style={{ fontFamily: 'var(--font-fraunces)' }}>
              {hits}
            </span>{' '}
            of {counted.length} working {counted.length === 1 ? 'day' : 'days'} had the plan by 6 PM the night before.
          </p>
        ) : (
          <p className="text-[15px] text-[var(--color-charcoal)]">The record starts with the first plan sent.</p>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1" aria-label="One mark per working day, newest first">
          {record.map((r) => (
            <span
              key={r.day}
              title={`${dayShort(r.day)}: ${r.first ? (r.ok ? 'on time' : 'late') : r.counts ? 'not sent' : 'before the routine started'}`}
              className="size-4 rounded-sm"
              style={{
                backgroundColor: r.ok ? '#2f6b4a' : r.first ? 'var(--color-gold)' : r.counts ? '#9a2a1f' : 'var(--color-stone)',
              }}
            />
          ))}
        </div>
        <p className="mt-2 text-[12px] text-[var(--color-charcoal-light)]">Green on time · gold late · red not sent. Newest first.</p>
      </Card>
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
  // Labor cost where a rate is on the seat (owners only: the rate is null for anyone else).
  const rateOf = (email: string) => data.people.find((p) => p.email === email)?.payRate ?? null
  const costOf = (email: string, minutes: number) => {
    const r = rateOf(email)
    return r === null ? null : (r * minutes) / 60
  }
  const totalCost = emails.reduce((sum, e) => sum + (costOf(e, inWeek.filter((s) => s.email === e).reduce((m, s) => m + workedMinutes(s), 0)) ?? 0), 0)
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
        <span className="text-right">
          <span className="block text-2xl text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
            {hoursText(total)}
          </span>
          {totalCost > 0 ? <span className="block text-[12px] text-[var(--color-charcoal-light)]">{money(totalCost)} at the rates on file</span> : null}
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
                    <span className="text-right">
                      <span className="block font-mono text-[15px] text-[var(--color-charcoal)]">{hoursText(minutes)}</span>
                      {costOf(email, minutes) !== null ? (
                        <span className="block font-mono text-[11px] text-[var(--color-charcoal-light)]">{money(costOf(email, minutes) as number)}</span>
                      ) : null}
                    </span>
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
  const { toast } = useCrewAdmin()
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
                {[p.groupName, p.trade, p.lang === 'es' ? 'Español' : 'English', p.email, p.lastSeenAt ? `opened ${ago(p.lastSeenAt)}` : '']
                  .filter(Boolean)
                  .join(' · ')}
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
        count={data.groups.length}
        action={
          <Button className="min-h-9 px-3 text-[13px]" onClick={() => show({ kind: 'group', group: null })}>
            <Plus className="size-4" aria-hidden="true" /> Group
          </Button>
        }
      >
        Groups
      </SectionTitle>
      <Card className="divide-y divide-[var(--color-stone)]">
        {data.groups.map((g) => {
          const members = data.people.filter((p) => p.active && p.group === g.id)
          return (
            <Row key={g.id} onClick={() => show({ kind: 'group', group: g })}>
              <span className="flex items-center justify-between gap-3">
                <span className="truncate text-[15px] text-[var(--color-charcoal)]">{g.name}</span>
                <Chip tone={g.perms.includes('crew.view') ? 'warn' : 'quiet'}>{`${g.perms.length} on`}</Chip>
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-[var(--color-charcoal-light)]">
                {members.length ? members.map((p) => firstNameOf(p.name)).join(', ') : 'Nobody yet'}
                {g.description ? ` · ${g.description}` : ''}
              </span>
            </Row>
          )
        })}
      </Card>
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">
        Each group is a set of switches. Move someone to another group from their seat, or flip a group&apos;s switches here.
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
              {(() => {
                const on = data.jobPeople.filter((a) => a.jobId === j.id).map((a) => firstNameOf(data.people.find((p) => p.email === a.email)?.name ?? a.email))
                return on.length ? <span className="mt-0.5 block truncate text-[12px] text-[var(--color-charcoal)]">On it: {on.join(', ')}</span> : null
              })()}
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
  const { data, error, refresh, isOwner, can } = useCrewAdmin()
  // A link from Home can open a view: /app/crew?view=plan.
  const asked = useSearchParams().get('view')
  const [view, setView] = useState<View>(asked && (VIEWS as readonly string[]).includes(asked) ? (asked as View) : 'today')
  const [open, setOpen] = useState<Open>(null)
  const [sheetKey, setSheetKey] = useState(0)

  function show(next: Open) {
    setSheetKey((k) => k + 1)
    setOpen(next)
  }
  const close = () => setOpen(null)

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

  const toCheck = data.tasks.filter((x) => isReportedDone(x) && x.email !== data.viewer.email).length
  const needs =
    data.entries.filter((e) => e.kind === 'timefix' && e.status === 'new').length +
    (can('hours.edit') ? data.shifts.filter((s) => s.status === 'ok' && s.review).length : 0) +
    data.tasks.filter((x) => x.status === 'blocked').length +
    toCheck
  const planDue = !data.reports.some((r) => r.day === addDays(data.day, 1))
  const pickupProblems = data.pickups.filter((p) => p.status === 'problem').length

  // The tabs follow the switches: an owner sees all of them.
  const options: { value: View; label: string; count?: number }[] = [
    { value: 'today', label: 'Today', count: needs },
    ...(can('projects.view') ? [{ value: 'projects' as const, label: 'Projects' }] : []),
    { value: 'schedule', label: 'Schedule' },
    ...(can('pickups.stage') && !isOwner ? [{ value: 'runner' as const, label: 'Runner', count: pickupProblems }] : []),
    { value: 'plan', label: 'Plan', count: can('plan.send') && !isOwner && planDue && new Date().getHours() >= 15 ? 1 : 0 },
    ...(can('hours.view') ? [{ value: 'hours' as const, label: 'Hours' }] : []),
    ...(isOwner ? [{ value: 'team' as const, label: 'Team' }] : []),
  ]

  return (
    <div className="px-4 pb-8 pt-6">
      <ScreenTitle eyebrow={dayShort(data.day)} title={isOwner ? 'Crew' : 'Your crew'} />
      <Segmented label="Crew views" value={view} onChange={setView} options={options} />
      <div className="mt-5">
        {view === 'today' ? <TodayView data={data} show={show} /> : null}
        {view === 'projects' && can('projects.view') ? <ProjectsView /> : null}
        {view === 'schedule' ? <ScheduleView data={data} show={show} /> : null}
        {view === 'runner' ? <RunnerView data={data} show={show} /> : null}
        {view === 'plan' ? (
          <>
            <PlanView data={data} />
            {isOwner || !can('pickups.stage') ? (
              <>
                <SectionTitle>Pickups</SectionTitle>
                <RunnerView data={data} show={show} />
              </>
            ) : null}
          </>
        ) : null}
        {view === 'hours' && can('hours.view') ? <HoursView data={data} show={show} /> : null}
        {view === 'team' && isOwner ? <TeamView data={data} show={show} /> : null}
      </div>

      {open?.kind === 'assign' ? <AssignSheet key={sheetKey} day={open.day} preset={open.preset} onClose={close} /> : null}
      {open?.kind === 'task-add' ? <TaskAddSheet key={sheetKey} to={open.to} onClose={close} /> : null}
      {open?.kind === 'task' ? <TaskSheet key={sheetKey} task={open.task} onClose={close} /> : null}
      {open?.kind === 'ask' ? <AskSheet key={sheetKey} to={open.to} onClose={close} /> : null}
      {open?.kind === 'pickup-add' ? <PickupAddSheet key={sheetKey} day={open.day} onClose={close} /> : null}
      {open?.kind === 'pickup' ? <PickupSheet key={sheetKey} pickup={open.pickup} onClose={close} /> : null}
      {open?.kind === 'job' ? <JobSheet key={sheetKey} job={open.job} suggested={open.suggested} onClose={close} /> : null}
      {can('hours.edit') && open?.kind === 'shift' ? <ShiftSheet key={sheetKey} shift={open.shift} onClose={close} /> : null}
      {can('hours.edit') && open?.kind === 'shift-add' ? <ShiftAddSheet key={sheetKey} day={open.day} email={open.email} onClose={close} /> : null}
      {can('hours.edit') && open?.kind === 'fix' ? <FixSheet key={sheetKey} entry={open.entry} onClose={close} /> : null}
      {isOwner && open?.kind === 'group' ? <GroupSheet key={sheetKey} group={open.group} onClose={close} /> : null}
      {isOwner && open?.kind === 'person' ? <PersonSheet key={sheetKey} person={open.person} onClose={close} /> : null}
    </div>
  )
}

/** The owners' Crew tab, inside the owners' app. */
export default function CrewAdminScreen() {
  const { home, toast } = useBot()
  if (home && home.me.role !== 'owner') {
    return (
      <div className="px-4 pt-6">
        <ScreenTitle title="Crew" />
        <Empty>This part of the app is for Lando, Marco and Ilene.</Empty>
      </div>
    )
  }
  return (
    <CrewAdminProvider toast={toast}>
      <Screen />
    </CrewAdminProvider>
  )
}

/** The Crew tab inside the crew app, for a seat whose group has it switched on. The server decides what is in it. */
export function LeadCrewScreen() {
  const { toast } = useCrew()
  return (
    <CrewAdminProvider toast={toast} member>
      <Screen />
    </CrewAdminProvider>
  )
}
