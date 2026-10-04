'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { Button, Field, INPUT, Segmented } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { addDays, clock12, dayLabel, hoursText, localClock, workedMinutes } from '@/lib/crew/time'
import { OTHER_JOB, parseAmount, type CrewHome, type CrewShift, type CrewTask, type Geo } from '@/lib/crew/types'
import { locate, newClientId, useCrew } from './CrewProvider'
import { PhotoStrip, usePhotos } from './Photos'

// The forms a crew member fills in: clock in and out, a receipt, progress
// photos, the end-of-day check-in, a note, a task, a time fix. Each is mounted
// only while it is open, so it always starts from a clean state.

export type JobChoice = { jobId: string; jobName: string }

/** The job a form should start on: where they are clocked in, else where they are scheduled today, else the last job they worked. */
export function defaultJob(home: CrewHome): JobChoice {
  const listed = (id: string) => id === OTHER_JOB || home.jobs.some((j) => j.id === id)
  if (home.shift && listed(home.shift.jobId)) return { jobId: home.shift.jobId, jobName: home.shift.jobId === OTHER_JOB ? home.shift.jobName : '' }
  const today = home.schedule.find((s) => s.day === home.day && s.ack !== 'cant' && listed(s.jobId))
  if (today) return { jobId: today.jobId, jobName: '' }
  const last = [...home.shifts].reverse().find((s) => listed(s.jobId))
  if (last) return { jobId: last.jobId, jobName: last.jobId === OTHER_JOB ? last.jobName : '' }
  return { jobId: home.jobs[0]?.id ?? OTHER_JOB, jobName: '' }
}

function validJob(job: JobChoice): boolean {
  return !!job.jobId && (job.jobId !== OTHER_JOB || job.jobName.trim().length >= 2)
}

export function JobPicker({
  value,
  onChange,
  allowNone = false,
  exclude,
}: {
  value: JobChoice
  onChange: (v: JobChoice) => void
  allowNone?: boolean
  exclude?: string
}) {
  const { home, t } = useCrew()
  const jobs = (home?.jobs ?? []).filter((j) => j.id !== exclude)
  return (
    <div className="space-y-2">
      <select
        aria-label={t.job}
        className={INPUT}
        value={value.jobId}
        onChange={(e) => onChange({ jobId: e.target.value, jobName: e.target.value === OTHER_JOB ? value.jobName : '' })}
      >
        {allowNone ? <option value="">{t.noJob}</option> : null}
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>
            {j.name}
          </option>
        ))}
        <option value={OTHER_JOB}>{t.otherJob}</option>
      </select>
      {value.jobId === OTHER_JOB ? (
        <input
          className={INPUT}
          value={value.jobName}
          maxLength={80}
          placeholder={t.otherJobName}
          aria-label={t.otherJobName}
          onChange={(e) => onChange({ jobId: OTHER_JOB, jobName: e.target.value })}
        />
      ) : null}
      {!jobs.length && !exclude ? <p className="text-[12px] text-[var(--color-charcoal-light)]">{t.noJobs}</p> : null}
    </div>
  )
}

function Sheet({ title, onClose, children, tall = true }: { title: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
  return (
    <BottomSheet isOpen onClose={onClose} ariaLabel={title} maxHeightDvh={tall ? 92 : 70} narrow>
      <div className="ph-no-capture space-y-4 px-5 pb-6 pt-1">
        <p role="heading" aria-level={2} className="text-xl text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          {title}
        </p>
        {children}
      </div>
    </BottomSheet>
  )
}

function Problem({ text }: { text: string }) {
  if (!text) return null
  return (
    <p role="alert" className="rounded-xl px-3 py-2.5 text-sm" style={{ backgroundColor: 'rgba(154,42,31,0.10)', color: '#7f1d1d' }}>
      {text}
    </p>
  )
}

const AREA = `${INPUT} min-h-[88px] resize-y`

// ---- the clock ----------------------------------------------------------------

export type PunchMode = 'in' | 'out' | 'switch'

export function PunchSheet({ mode, onClose, onClockedOut }: { mode: PunchMode; onClose: () => void; onClockedOut?: () => void }) {
  const { home, t, punch, toast } = useCrew()
  const [job, setJob] = useState<JobChoice>(() => {
    if (!home) return { jobId: OTHER_JOB, jobName: '' }
    if (mode === 'switch') {
      const other = home.jobs.find((j) => j.id !== home.shift?.jobId)
      return { jobId: other?.id ?? OTHER_JOB, jobName: '' }
    }
    return defaultJob(home)
  })
  const [lunch, setLunch] = useState('0')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  // Ask the phone where it is as soon as the sheet opens, so the tap itself does not wait on it.
  const geo = useRef<Promise<Geo | null> | null>(null)
  useEffect(() => {
    geo.current = locate()
  }, [])

  if (!home) return null
  const title = mode === 'in' ? t.clockIn : mode === 'out' ? t.clockOut : t.changeJob
  const jobName = job.jobId === OTHER_JOB ? job.jobName.trim() : (home.jobs.find((j) => j.id === job.jobId)?.name ?? '')

  async function go() {
    if (!home) return
    if (mode !== 'out' && !validJob(job)) {
      setProblem(t.otherJobName)
      return
    }
    setBusy(true)
    setProblem('')
    const where = await Promise.race([geo.current ?? Promise.resolve(null), new Promise<null>((r) => window.setTimeout(() => r(null), 2500))])
    const time = clock12(new Date())
    const res =
      mode === 'in'
        ? await punch({ kind: 'punch.in', jobId: job.jobId, jobName: job.jobName.trim(), geo: where, note: note.trim() }, t.punchWaitingIn(jobName, time))
        : mode === 'out'
          ? await punch({ kind: 'punch.out', breakMin: Number(lunch), geo: where, note: note.trim() }, t.punchWaitingOut(time))
          : await punch({ kind: 'punch.switch', jobId: job.jobId, jobName: job.jobName.trim(), geo: where }, t.punchWaitingSwitch(jobName, time))
    setBusy(false)
    if (!res.ok) {
      setProblem(res.text)
      return
    }
    if (res.queued) toast(res.text, 'info')
    else if (mode === 'in') toast(t.clockedIn(jobName, time), 'ok')
    else if (mode === 'switch') toast(t.changedJob(jobName), 'ok')
    else {
      const worked = home.shifts.filter((s) => s.day === home.day).reduce((sum, s) => sum + workedMinutes(s.endedAt ? s : { ...s, endedAt: new Date().toISOString(), breakMin: Number(lunch) }), 0)
      toast(t.clockedOut(hoursText(worked)), 'ok')
    }
    onClose()
    if (mode === 'out' && !res.queued) onClockedOut?.()
  }

  return (
    <Sheet title={title} onClose={onClose} tall={false}>
      {mode === 'out' ? (
        <>
          {home.shift ? (
            <p className="text-sm text-[var(--color-charcoal)]">
              {home.shift.jobName} · {t.since(clock12(home.shift.startedAt))} · {hoursText(workedMinutes(home.shift))}
            </p>
          ) : null}
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">{t.lunch}</p>
            <Segmented
              label={t.lunch}
              value={lunch}
              onChange={setLunch}
              options={[
                { value: '0', label: t.lunchNone },
                { value: '30', label: '30 min' },
                { value: '45', label: '45 min' },
                { value: '60', label: '1 h' },
              ]}
            />
          </div>
        </>
      ) : (
        <Field label={t.whichJob}>
          <JobPicker value={job} onChange={setJob} exclude={mode === 'switch' ? home.shift?.jobId : undefined} />
        </Field>
      )}
      {mode !== 'switch' ? (
        <Field label={`${t.note} (${t.optional})`}>
          <input className={INPUT} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
      ) : null}
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} onClick={go} className="min-h-14 text-base">
        {title}
      </Button>
      <p className="text-center text-[11px] text-[var(--color-charcoal-light)]">{t.locationNote}</p>
    </Sheet>
  )
}

// ---- what they send in ----------------------------------------------------------

export function ReceiptSheet({ onClose }: { onClose: () => void }) {
  const { home, t, act, toast } = useCrew()
  const photos = usePhotos()
  const cid = useRef(newClientId())
  const [job, setJob] = useState<JobChoice>(() => (home ? defaultJob(home) : { jobId: OTHER_JOB, jobName: '' }))
  const [amount, setAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [paidBy, setPaidBy] = useState<'company' | 'me'>('company')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  async function go() {
    if (!photos.refs.length) return setProblem(t.needPhoto)
    if (!validJob(job)) return setProblem(t.otherJobName)
    const figure = amount.trim() ? parseAmount(amount) : null
    if (amount.trim() && figure === null) return setProblem(`${t.amountLabel}: 146.61`)
    setBusy(true)
    setProblem('')
    const res = await act({
      kind: 'receipt.add',
      jobId: job.jobId,
      jobName: job.jobName.trim(),
      amount: figure,
      vendor: vendor.trim(),
      paidBy,
      note: note.trim(),
      files: photos.refs,
      clientId: cid.current,
    })
    setBusy(false)
    if (!res.ok) return setProblem(res.text)
    toast(t.receiptSent, 'ok')
    onClose()
  }

  return (
    <Sheet title={t.receiptTitle} onClose={onClose}>
      <p className="text-sm text-[var(--color-charcoal-light)]">{t.receiptPhoto}</p>
      <PhotoStrip photos={photos} cameraFirst />
      <Field label={t.job}>
        <JobPicker value={job} onChange={setJob} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.amount}>
          <input className={INPUT} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={`${t.store} (${t.optional})`}>
          <input className={INPUT} value={vendor} maxLength={80} onChange={(e) => setVendor(e.target.value)} />
        </Field>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">{t.whoPaid}</p>
        <Segmented
          label={t.whoPaid}
          value={paidBy}
          onChange={setPaidBy}
          options={[
            { value: 'company', label: t.paidCompany },
            { value: 'me', label: t.paidMe },
          ]}
        />
        {paidBy === 'me' ? <p className="mt-1.5 text-[12px] text-[var(--color-charcoal-light)]">{t.paidMeNote}</p> : null}
      </div>
      <Field label={`${t.whatFor} (${t.optional})`}>
        <input className={INPUT} value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} disabled={photos.busy} onClick={go} className="min-h-12">
        {photos.busy ? t.uploading : t.send_}
      </Button>
    </Sheet>
  )
}

export function ProgressSheet({ onClose }: { onClose: () => void }) {
  const { home, t, act, toast } = useCrew()
  const photos = usePhotos()
  const cid = useRef(newClientId())
  const [job, setJob] = useState<JobChoice>(() => (home ? defaultJob(home) : { jobId: OTHER_JOB, jobName: '' }))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  async function go() {
    if (!photos.refs.length && !note.trim()) return setProblem(t.needNoteOrPhoto)
    if (!validJob(job)) return setProblem(t.otherJobName)
    setBusy(true)
    setProblem('')
    const res = await act({ kind: 'progress.add', jobId: job.jobId, jobName: job.jobName.trim(), note: note.trim(), files: photos.refs, clientId: cid.current })
    setBusy(false)
    if (!res.ok) return setProblem(res.text)
    toast(t.progressSent, 'ok')
    onClose()
  }

  return (
    <Sheet title={t.progressTitle} onClose={onClose}>
      <p className="text-sm text-[var(--color-charcoal-light)]">{t.progressTip}</p>
      <PhotoStrip photos={photos} cameraFirst />
      <Field label={t.job}>
        <JobPicker value={job} onChange={setJob} />
      </Field>
      <Field label={t.progressWhat}>
        <textarea className={AREA} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} disabled={photos.busy} onClick={go} className="min-h-12">
        {photos.busy ? t.uploading : t.send_}
      </Button>
    </Sheet>
  )
}

type EodExtra = 'asked' | 'deliveries' | 'visits' | 'safety' | 'decision'

export function EodSheet({ onClose, forDay }: { onClose: () => void; forDay?: string }) {
  const { home, t, act, toast, lang } = useCrew()
  const photos = usePhotos()
  const cid = useRef(newClientId())
  const today = home?.day ?? ''
  const yesterday = today ? addDays(today, -1) : ''
  // Before noon, the day someone is closing out is often yesterday.
  const morning = home ? localClock(home.now) < '12:00' : false
  const [day, setDay] = useState(forDay && (forDay === today || forDay === yesterday) ? forDay : today)
  const [job, setJob] = useState<JobChoice>(() => (home ? defaultJob(home) : { jobId: OTHER_JOB, jobName: '' }))
  const [done, setDone] = useState('')
  const [stuck, setStuck] = useState('')
  const [needs, setNeeds] = useState('')
  const [open, setOpen] = useState<Record<EodExtra, boolean>>({ asked: false, deliveries: false, visits: false, safety: false, decision: false })
  const [extra, setExtra] = useState<Record<EodExtra, string>>({ asked: '', deliveries: '', visits: '', safety: '', decision: '' })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  const rows: { key: EodExtra; ask: string; what: string; hint?: string }[] = [
    { key: 'asked', ask: t.eodAsked, what: t.eodAskedWhat, hint: t.eodAskedHint },
    { key: 'deliveries', ask: t.eodDeliveries, what: t.eodDeliveriesWhat },
    { key: 'visits', ask: t.eodVisits, what: t.eodVisitsWhat },
    { key: 'safety', ask: t.eodSafety, what: t.eodSafetyWhat },
    { key: 'decision', ask: t.eodDecision, what: t.eodDecisionWhat },
  ]

  async function go() {
    if (done.trim().length < 2) return setProblem(t.eodNeedDone)
    if (!validJob(job)) return setProblem(t.otherJobName)
    setBusy(true)
    setProblem('')
    const value = (k: EodExtra) => (open[k] ? extra[k].trim() || t.yes : '')
    const res = await act({
      kind: 'eod.add',
      jobId: job.jobId,
      jobName: job.jobName.trim(),
      day,
      done: done.trim(),
      stuck: stuck.trim(),
      needs: needs.trim(),
      asked: value('asked'),
      deliveries: value('deliveries'),
      visits: value('visits'),
      safety: value('safety'),
      decision: value('decision'),
      files: photos.refs,
      clientId: cid.current,
    })
    setBusy(false)
    if (!res.ok) return setProblem(res.text)
    toast(t.eodSent, 'ok')
    onClose()
  }

  return (
    <Sheet title={`${t.eodTitle} · ${dayLabel(day, today, lang)}`} onClose={onClose}>
      {morning || day !== today ? (
        <label className="flex min-h-11 items-center gap-2.5 text-sm text-[var(--color-charcoal)]">
          <input type="checkbox" className="size-5" checked={day === yesterday} onChange={(e) => setDay(e.target.checked ? yesterday : today)} />
          {t.eodForYesterday}
        </label>
      ) : null}
      <Field label={t.job}>
        <JobPicker value={job} onChange={setJob} />
      </Field>
      <Field label={t.eodDone}>
        <textarea className={AREA} value={done} maxLength={2000} onChange={(e) => setDone(e.target.value)} />
      </Field>
      <Field label={t.eodStuck}>
        <textarea className={`${INPUT} min-h-[64px] resize-y`} value={stuck} maxLength={1500} onChange={(e) => setStuck(e.target.value)} />
      </Field>
      <Field label={t.eodNeeds} hint={t.eodNeedsHint}>
        <textarea className={`${INPUT} min-h-[64px] resize-y`} value={needs} maxLength={1500} onChange={(e) => setNeeds(e.target.value)} />
      </Field>

      <p className="pt-1 text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--color-gold-accessible)' }}>
        {t.eodMore}
      </p>
      <div className="divide-y divide-[var(--color-stone)] rounded-2xl border border-[var(--color-stone)] bg-white">
        {rows.map((r) => (
          <div key={r.key} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] leading-snug text-[var(--color-charcoal)]">{r.ask}</span>
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-[var(--color-stone-mid)]">
                {[false, true].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    aria-pressed={open[r.key] === v}
                    onClick={() => setOpen((o) => ({ ...o, [r.key]: v }))}
                    className={`min-h-10 min-w-12 px-3 text-sm font-medium ${open[r.key] === v ? 'bg-[var(--color-teal)] text-white' : 'bg-white text-[var(--color-charcoal)]'}`}
                  >
                    {v ? t.yes : t.no}
                  </button>
                ))}
              </div>
            </div>
            {open[r.key] ? (
              <div className="mt-2.5">
                {r.hint ? <p className="mb-2 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">{r.hint}</p> : null}
                <textarea
                  className={`${INPUT} min-h-[64px] resize-y`}
                  placeholder={r.what}
                  aria-label={r.what}
                  value={extra[r.key]}
                  maxLength={1500}
                  onChange={(e) => setExtra((x) => ({ ...x, [r.key]: e.target.value }))}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">{t.eodPhotos}</p>
        <PhotoStrip photos={photos} />
      </div>
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} disabled={photos.busy} onClick={go} className="min-h-12">
        {photos.busy ? t.uploading : t.eodSend}
      </Button>
    </Sheet>
  )
}

export function NoteSheet({ onClose, start = '' }: { onClose: () => void; start?: string }) {
  const { home, t, act, toast } = useCrew()
  const photos = usePhotos()
  const cid = useRef(newClientId())
  const [job, setJob] = useState<JobChoice>(() => (home?.shift ? defaultJob(home) : { jobId: '', jobName: '' }))
  const [note, setNote] = useState(start)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  async function go() {
    if (note.trim().length < 2) return setProblem(t.noteWhat)
    if (job.jobId && !validJob(job)) return setProblem(t.otherJobName)
    setBusy(true)
    setProblem('')
    const res = await act({ kind: 'note.add', jobId: job.jobId, jobName: job.jobName.trim(), note: note.trim(), files: photos.refs, clientId: cid.current })
    setBusy(false)
    if (!res.ok) return setProblem(res.text)
    toast(t.noteSent, 'ok')
    onClose()
  }

  return (
    <Sheet title={t.noteTitle} onClose={onClose}>
      <Field label={t.noteWhat}>
        <textarea className={AREA} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label={`${t.job} (${t.optional})`}>
        <JobPicker value={job} onChange={setJob} allowNone />
      </Field>
      <PhotoStrip photos={photos} />
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} disabled={photos.busy} onClick={go} className="min-h-12">
        {photos.busy ? t.uploading : t.send_}
      </Button>
    </Sheet>
  )
}

// ---- tasks ----------------------------------------------------------------------

export function TaskSheet({ task, onClose }: { task: CrewTask; onClose: () => void }) {
  const { home, t, act, toast, lang } = useCrew()
  const photos = usePhotos()
  const [note, setNote] = useState(task.status === 'blocked' ? task.doneNote : '')
  const [busy, setBusy] = useState<'done' | 'blocked' | 'open' | null>(null)
  const [problem, setProblem] = useState('')

  async function set(status: 'done' | 'blocked' | 'open') {
    if (status === 'blocked' && note.trim().length < 2) return setProblem(t.blockedWhy)
    setBusy(status)
    setProblem('')
    const res = await act({ kind: 'task.update', id: task.id, status, note: note.trim(), files: photos.refs })
    setBusy(null)
    if (!res.ok) return setProblem(res.text)
    if (status === 'done') toast(t.taskDone, 'ok')
    if (status === 'blocked') toast(t.taskBlocked, 'info')
    onClose()
  }

  return (
    <Sheet title={task.title} onClose={onClose}>
      <p className="text-[13px] text-[var(--color-charcoal-light)]">
        {[task.jobName, task.due && home ? t.due(dayLabel(task.due, home.day, lang)) : ''].filter(Boolean).join(' · ')}
      </p>
      {task.detail ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-charcoal)]">{task.detail}</p> : null}
      {task.status === 'done' ? (
        <Button full busy={busy === 'open'} onClick={() => set('open')}>
          {t.reopen}
        </Button>
      ) : (
        <>
          <Field label={`${t.doneNote} / ${t.blockedWhy}`}>
            <textarea className={`${INPUT} min-h-[64px] resize-y`} value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <PhotoStrip photos={photos} cameraFirst />
          <Problem text={problem} />
          <div className="grid grid-cols-2 gap-3">
            <Button busy={busy === 'blocked'} disabled={photos.busy} onClick={() => set('blocked')} className="min-h-12">
              {t.blocked}
            </Button>
            <Button variant="primary" busy={busy === 'done'} disabled={photos.busy} onClick={() => set('done')} className="min-h-12">
              {t.markDone}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}

// ---- schedule and time ------------------------------------------------------------

export function CantSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const { t, act } = useCrew()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  async function go() {
    setBusy(true)
    const res = await act({ kind: 'schedule.ack', id, ack: 'cant', note: note.trim() })
    setBusy(false)
    if (!res.ok) return setProblem(res.text)
    onClose()
  }

  return (
    <Sheet title={t.cantMakeIt} onClose={onClose} tall={false}>
      <Field label={t.cantWhy}>
        <textarea className={`${INPUT} min-h-[64px] resize-y`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} onClick={go} className="min-h-12">
        {t.tellOffice}
      </Button>
    </Sheet>
  )
}

export function FixTimeSheet({ shift, onClose }: { shift: CrewShift | null; onClose: () => void }) {
  const { home, t, act, toast, lang } = useCrew()
  const cid = useRef(newClientId())
  const today = home?.day ?? ''
  const days = useMemo(() => (today ? Array.from({ length: 15 }, (_, i) => addDays(today, -i)) : []), [today])
  const [day, setDay] = useState(shift?.day ?? today)
  const [start, setStart] = useState(shift ? localClock(shift.startedAt) : '06:00')
  const [end, setEnd] = useState(shift?.endedAt ? localClock(shift.endedAt) : '14:30')
  const [lunch, setLunch] = useState(String(shift?.breakMin ?? 0))
  const [job, setJob] = useState<JobChoice>(() => {
    if (shift) return { jobId: shift.jobId, jobName: shift.jobId === OTHER_JOB ? shift.jobName : '' }
    return home ? defaultJob(home) : { jobId: OTHER_JOB, jobName: '' }
  })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  async function go() {
    if (note.trim().length < 3) return setProblem(t.fixWhy)
    if (!validJob(job)) return setProblem(t.otherJobName)
    setBusy(true)
    setProblem('')
    const res = await act({
      kind: 'timefix.add',
      day,
      start,
      end,
      breakMin: Number(lunch),
      jobId: job.jobId,
      jobName: job.jobName.trim(),
      shiftId: shift?.id ?? null,
      note: note.trim(),
      clientId: cid.current,
    })
    setBusy(false)
    if (!res.ok) return setProblem(res.text)
    toast(t.fixSent, 'ok')
    onClose()
  }

  return (
    <Sheet title={t.fixTitle} onClose={onClose}>
      <p className="text-sm text-[var(--color-charcoal-light)]">{t.fixIntro}</p>
      <Field label={t.fixDay}>
        <select className={INPUT} value={day} disabled={!!shift} onChange={(e) => setDay(e.target.value)}>
          {days.map((d) => (
            <option key={d} value={d}>
              {dayLabel(d, today, lang)}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.fixIn}>
          <input type="time" className={INPUT} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t.fixOut}>
          <input type="time" className={INPUT} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">{t.lunch}</p>
        <Segmented
          label={t.lunch}
          value={lunch}
          onChange={setLunch}
          options={[
            { value: '0', label: t.lunchNone },
            { value: '30', label: '30 min' },
            { value: '45', label: '45 min' },
            { value: '60', label: '1 h' },
          ]}
        />
      </div>
      <Field label={t.job}>
        <JobPicker value={job} onChange={setJob} />
      </Field>
      <Field label={t.fixWhy}>
        <textarea className={`${INPUT} min-h-[64px] resize-y`} value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} onClick={go} className="min-h-12">
        {t.fixSend}
      </Button>
    </Sheet>
  )
}
