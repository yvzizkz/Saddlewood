'use client'

import { useEffect, useState } from 'react'
import { Camera, ClipboardCheck, MapPin, MessageSquare, Receipt, type LucideIcon } from 'lucide-react'

import { Button, Card, Chip, Empty, INPUT, ScreenTitle, SectionTitle } from '@/components/bot/ui'
import { addDays, clock12, clockText, dayLabel, dayShort, hoursText, localClock, workedMinutes } from '@/lib/crew/time'
import { firstNameOf, parseAmount, type CrewEntry, type CrewQuestion, type CrewScheduleItem, type CrewTask } from '@/lib/crew/types'
import { useCrew } from './CrewProvider'
import { CantSheet, EodSheet, NoteSheet, ProgressSheet, PunchSheet, ReceiptSheet, TaskSheet, type PunchMode } from './CrewSheets'
import type { CrewStrings } from './strings'

// A crew member's day on one screen: the clock, where they are supposed to
// be, what the office is asking, what is assigned to them, and four buttons
// for what they send in.

type Open =
  | { kind: 'punch'; mode: PunchMode }
  | { kind: 'receipt' | 'progress' | 'note' }
  | { kind: 'eod'; day?: string }
  | { kind: 'task'; task: CrewTask }
  | { kind: 'cant'; id: number }
  | null

function greetingFor(now: string, t: CrewStrings): string {
  const hour = Number(localClock(now).slice(0, 2))
  return hour < 12 ? t.morning : hour < 17 ? t.afternoon : t.evening
}

/** Re-render once a minute so "3 h 14 min" keeps counting. */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** Apple Maps on an iPhone, Google Maps everywhere else. Only called once the page is live in a browser. */
export function mapsLink(address: string): string {
  const q = encodeURIComponent(address)
  const ios = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
  return ios ? `https://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`
}

export function entryLine(e: CrewEntry, t: CrewStrings, lang: 'en' | 'es' = 'en'): { title: string; detail: string } {
  const text = (k: string) => (typeof e.data[k] === 'string' ? (e.data[k] as string) : '')
  if (e.kind === 'receipt') {
    const amount = typeof e.bot.amount === 'number' ? e.bot.amount : typeof e.data.amount === 'number' ? e.data.amount : null
    const vendor = (typeof e.bot.vendor === 'string' && e.bot.vendor) || text('vendor')
    return {
      title: [t.kindReceipt, vendor, amount !== null && amount > 0 ? `$${amount.toFixed(2)}` : ''].filter(Boolean).join(' · '),
      detail: [e.jobName, e.body].filter(Boolean).join(' · '),
    }
  }
  if (e.kind === 'progress') {
    return { title: e.body || t.kindProgress, detail: [e.jobName, e.files.length ? t.photos(e.files.length) : ''].filter(Boolean).join(' · ') }
  }
  if (e.kind === 'eod') return { title: t.eodFiled, detail: [e.jobName, e.body].filter(Boolean).join(' · ') }
  if (e.kind === 'timefix') {
    return {
      title: `${t.kindTimefix} · ${dayShort(e.day, lang)}`,
      detail: `${clockText(text('start'))} – ${clockText(text('end'))} · ${e.jobName}`,
    }
  }
  return { title: e.body, detail: e.jobName }
}

export function entryStatus(e: CrewEntry, t: CrewStrings): { label: string; tone: 'ok' | 'warn' | 'bad' | 'quiet' } {
  if (e.kind === 'timefix') {
    if (e.status === 'approved') return { label: t.stApproved, tone: 'ok' }
    if (e.status === 'denied') return { label: t.stDenied, tone: 'bad' }
    return { label: t.stWaiting, tone: 'warn' }
  }
  if (e.status === 'filed') return { label: t.stFiled, tone: 'ok' }
  if (e.status === 'needs') return { label: t.stNeeds, tone: 'warn' }
  return { label: t.stNew, tone: 'quiet' }
}

function QuestionCard({ q, onEod }: { q: CrewQuestion; onEod: (day?: string) => void }) {
  const { t, act, lang, toast } = useCrew()
  const [text, setText] = useState('')
  const [time, setTime] = useState('15:30')
  const [busy, setBusy] = useState<string | null>(null)
  const body = lang === 'es' && q.bodyEs ? q.bodyEs : q.body

  async function send(answer: string, key: string) {
    if (!answer.trim()) return
    setBusy(key)
    const res = await act({ kind: 'answer', id: q.id, answer: answer.trim() })
    setBusy(null)
    if (!res.ok) toast(res.text, 'bad')
  }

  return (
    <Card className="border-[var(--color-gold)] px-4 py-3.5">
      <p className="whitespace-pre-wrap text-[15px] leading-snug text-[var(--color-charcoal)]">{body}</p>
      <div className="mt-3 space-y-2">
        {q.kind === 'eod' ? (
          <Button variant="primary" full onClick={() => onEod(typeof q.ref.day === 'string' ? q.ref.day : undefined)}>
            {t.openForm}
          </Button>
        ) : null}

        {q.options.length ? (
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => (
              <Button key={o.v} busy={busy === o.v} disabled={!!busy} onClick={() => send(o.v, o.v)}>
                {lang === 'es' && o.es ? o.es : o.en}
              </Button>
            ))}
          </div>
        ) : null}

        {q.kind === 'clockout' ? (
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-medium text-[var(--color-charcoal)]">{t.iLeftAt}</span>
              <input type="time" className={INPUT} value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <Button variant="primary" busy={busy === 'time'} disabled={!!busy} onClick={() => send(time, 'time')}>
              {t.send}
            </Button>
          </div>
        ) : null}

        {q.kind === 'amount' ? (
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-medium text-[var(--color-charcoal)]">{t.amountLabel}</span>
              <input className={INPUT} inputMode="decimal" placeholder="0.00" value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <Button variant="primary" busy={busy === 'text'} disabled={!!busy || parseAmount(text) === null} onClick={() => send(text, 'text')}>
              {t.send}
            </Button>
          </div>
        ) : null}

        {q.kind === 'ask' || q.kind === 'late' ? (
          <div className="flex items-end gap-2">
            <input
              className={INPUT}
              value={text}
              maxLength={1000}
              placeholder={t.answer}
              aria-label={t.answer}
              onChange={(e) => setText(e.target.value)}
            />
            <Button variant="primary" busy={busy === 'text'} disabled={!!busy || !text.trim()} onClick={() => send(text, 'text')}>
              {t.send}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

function ScheduleCard({ item, label, onCant }: { item: CrewScheduleItem; label: string; onCant: () => void }) {
  const { home, t, act, toast } = useCrew()
  const [busy, setBusy] = useState(false)
  const job = home?.jobs.find((j) => j.id === item.jobId)

  async function ok() {
    setBusy(true)
    const res = await act({ kind: 'schedule.ack', id: item.id, ack: 'ok', note: '' })
    setBusy(false)
    if (!res.ok) toast(res.text, 'bad')
  }

  return (
    <Card className="px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--color-gold-accessible)' }}>
        {label}
      </p>
      <p className="mt-1 text-lg leading-snug text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
        {item.jobName}
      </p>
      <p className="mt-0.5 text-[13px] text-[var(--color-charcoal-light)]">
        {[item.startTime ? t.startAt(clockText(item.startTime)) : '', job?.address].filter(Boolean).join(' · ')}
      </p>
      {item.note ? <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-charcoal)]">{item.note}</p> : null}
      {job?.note ? <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-charcoal-light)]">{job.note}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {job?.address ? (
          <a
            href={mapsLink(job.address)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--color-stone-mid)] bg-white px-3.5 text-sm font-medium text-[var(--color-charcoal)]"
          >
            <MapPin className="size-4" aria-hidden="true" />
            {t.directions}
          </a>
        ) : null}
        {item.ack === 'ok' ? (
          <Chip tone="ok">{t.youSaidOk}</Chip>
        ) : item.ack === 'cant' ? (
          <Chip tone="bad">{t.youSaidCant}</Chip>
        ) : (
          <>
            <Button variant="primary" busy={busy} onClick={ok}>
              {t.gotIt}
            </Button>
            <Button variant="quiet" onClick={onCant}>
              {t.cantMakeIt}
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

function Tile({ icon: Icon, label, hint, onClick, done }: { icon: LucideIcon; label: string; hint: string; onClick: () => void; done?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[84px] flex-col items-start justify-between rounded-2xl border border-[var(--color-stone)] bg-white px-3.5 py-3 text-left active:bg-[var(--color-cream)]"
    >
      <span className="flex w-full items-center justify-between">
        <Icon className="size-6 text-[var(--color-teal)]" strokeWidth={1.8} aria-hidden="true" />
        {done ? <Chip tone="ok">✓</Chip> : null}
      </span>
      <span>
        <span className="block text-[15px] font-medium text-[var(--color-charcoal)]">{label}</span>
        <span className="block text-[12px] leading-snug text-[var(--color-charcoal-light)]">{hint}</span>
      </span>
    </button>
  )
}

export function TaskRow({ task, onOpen }: { task: CrewTask; onOpen: () => void }) {
  const { home, t, lang } = useCrew()
  const late = !!task.due && !!home && task.due < home.day && task.status !== 'done'
  return (
    <button type="button" onClick={onOpen} className="block w-full px-4 py-3 text-left active:bg-[var(--color-cream)]">
      <span className={`block text-[15px] leading-snug text-[var(--color-charcoal)] ${task.status === 'done' ? 'line-through opacity-60' : ''}`}>{task.title}</span>
      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-charcoal-light)]">
        {task.status === 'blocked' ? <Chip tone="bad">{t.stuck}</Chip> : null}
        {task.status === 'done' ? <Chip tone="ok">{t.done}</Chip> : null}
        {task.due && home && task.status !== 'done' ? <Chip tone={late ? 'bad' : 'quiet'}>{t.due(dayLabel(task.due, home.day, lang))}</Chip> : null}
        {task.jobName}
      </span>
    </button>
  )
}

export default function TodayScreen() {
  const { home, error, t, lang, queue, flush, refresh } = useCrew()
  const [open, setOpen] = useState<Open>(null)
  const [sheetKey, setSheetKey] = useState(0)
  const nowMs = useMinute()

  function show(next: Open) {
    setSheetKey((k) => k + 1)
    setOpen(next)
  }

  if (!home) {
    return (
      <div className="px-4 pt-6">
        <ScreenTitle title="Saddlewood" />
        {error ? (
          <>
            <Empty>{error}</Empty>
            <Button full className="mt-3" onClick={() => void refresh()}>
              {t.tryAgain}
            </Button>
          </>
        ) : (
          <Empty>{t.loading}</Empty>
        )}
      </div>
    )
  }

  const shift = home.shift
  const todayMinutes = home.shifts.filter((s) => s.day === home.day).reduce((sum, s) => sum + workedMinutes(s, nowMs), 0)
  const today = home.schedule.filter((s) => s.day === home.day)
  const tomorrow = home.schedule.filter((s) => s.day === addDays(home.day, 1))
  const openTasks = home.tasks.filter((x) => x.status === 'open' || x.status === 'blocked')
  const sentToday = home.entries.filter((e) => e.day === home.day)
  const eodDone = sentToday.some((e) => e.kind === 'eod')
  const waiting = queue.length > 0

  return (
    <div className="px-4 pb-8 pt-6">
      <ScreenTitle eyebrow={dayShort(home.day, lang)} title={`${greetingFor(home.now, t)}, ${firstNameOf(home.me.name)}`} />

      {waiting ? (
        <Card className="mb-4 border-[var(--color-gold)] px-4 py-3.5">
          <p className="text-[14px] font-medium text-[var(--color-charcoal)]">{t.punchWaiting}</p>
          <ul className="mt-1.5 space-y-0.5 text-[13px] text-[var(--color-charcoal-light)]">
            {queue.map((q) => (
              <li key={q.act.clientId}>{q.label}</li>
            ))}
          </ul>
          <Button className="mt-3" onClick={() => void flush()}>
            {t.sendNow}
          </Button>
        </Card>
      ) : null}

      {home.questions.length ? (
        <>
          <SectionTitle count={home.questions.length}>{t.officeAsks}</SectionTitle>
          <div className="space-y-3">
            {home.questions.map((q) => (
              <QuestionCard key={q.id} q={q} onEod={(day) => show({ kind: 'eod', day })} />
            ))}
          </div>
          <div className="h-6" />
        </>
      ) : null}

      <Card className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: shift ? '#2f6b4a' : 'var(--color-charcoal-light)' }}>
              {shift ? t.onClock : t.offClock}
            </p>
            {shift ? (
              <>
                <p className="mt-1 truncate text-xl text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
                  {shift.jobName}
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--color-charcoal-light)]">
                  {t.since(clock12(shift.startedAt))} · {hoursText(workedMinutes(shift, nowMs))}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[15px] text-[var(--color-charcoal)]">{todayMinutes > 0 ? t.todayTotal(hoursText(todayMinutes)) : today[0]?.jobName ?? ''}</p>
            )}
          </div>
          {shift && todayMinutes > 0 ? <Chip tone="ok">{t.todayTotal(hoursText(todayMinutes))}</Chip> : null}
        </div>
        {shift?.review ? (
          <p className="mt-2">
            <Chip tone="warn">{t.officeWillCheck}</Chip>
          </p>
        ) : null}
        <div className="mt-4 grid gap-2.5">
          {shift ? (
            <>
              <Button variant="primary" full disabled={waiting} onClick={() => show({ kind: 'punch', mode: 'out' })} className="min-h-14 text-base">
                {t.clockOut}
              </Button>
              <Button full disabled={waiting} onClick={() => show({ kind: 'punch', mode: 'switch' })}>
                {t.changeJob}
              </Button>
            </>
          ) : (
            <Button variant="primary" full disabled={waiting} onClick={() => show({ kind: 'punch', mode: 'in' })} className="min-h-14 text-base">
              {t.clockIn}
            </Button>
          )}
        </div>
      </Card>

      {today.length ? (
        <div className="mt-4 space-y-3">
          {today.map((item) => (
            <ScheduleCard key={item.id} item={item} label={t.yourJobToday} onCant={() => show({ kind: 'cant', id: item.id })} />
          ))}
        </div>
      ) : null}
      {tomorrow.length ? (
        <div className="mt-4 space-y-3">
          {tomorrow.map((item) => (
            <ScheduleCard key={item.id} item={item} label={t.yourJobTomorrow} onCant={() => show({ kind: 'cant', id: item.id })} />
          ))}
        </div>
      ) : null}

      <SectionTitle>{t.send_}</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Tile icon={Receipt} label={t.receipt} hint={t.receiptHint} onClick={() => show({ kind: 'receipt' })} />
        <Tile icon={Camera} label={t.progress} hint={t.progressHint} onClick={() => show({ kind: 'progress' })} />
        <Tile icon={ClipboardCheck} label={t.eod} hint={t.eodHint} done={eodDone} onClick={() => show({ kind: 'eod' })} />
        <Tile icon={MessageSquare} label={t.noteToOffice} hint={t.noteHint} onClick={() => show({ kind: 'note' })} />
      </div>

      {openTasks.length ? (
        <>
          <SectionTitle count={openTasks.length}>{t.tasks}</SectionTitle>
          <Card className="divide-y divide-[var(--color-stone)]">
            {openTasks.map((task) => (
              <TaskRow key={task.id} task={task} onOpen={() => show({ kind: 'task', task })} />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>{t.sentToday}</SectionTitle>
      {sentToday.length ? (
        <Card className="divide-y divide-[var(--color-stone)]">
          {sentToday.map((e) => {
            const line = entryLine(e, t, lang)
            const status = entryStatus(e, t)
            return (
              <div key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[15px] leading-snug text-[var(--color-charcoal)]">{line.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--color-charcoal-light)]">
                    {[clock12(e.createdAt), line.detail].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Chip tone={status.tone}>{status.label}</Chip>
              </div>
            )
          })}
        </Card>
      ) : (
        <Empty>{t.nothingSent}</Empty>
      )}

      {open?.kind === 'punch' ? (
        <PunchSheet
          key={sheetKey}
          mode={open.mode}
          onClose={() => setOpen(null)}
          onClockedOut={() => {
            // Clocking out in the afternoon is the moment to close the day, if it
            // has not been. Before 12:30 it is more likely lunch or a job change.
            if (!eodDone && localClock(new Date()) >= '12:30') show({ kind: 'eod' })
          }}
        />
      ) : null}
      {open?.kind === 'receipt' ? <ReceiptSheet key={sheetKey} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'progress' ? <ProgressSheet key={sheetKey} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'eod' ? <EodSheet key={sheetKey} forDay={open.day} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'note' ? <NoteSheet key={sheetKey} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'task' ? <TaskSheet key={sheetKey} task={open.task} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'cant' ? <CantSheet key={sheetKey} id={open.id} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}
