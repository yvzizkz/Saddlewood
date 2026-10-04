'use client'

import { useState, type ReactNode } from 'react'
import { Copy, Mail, Share2 } from 'lucide-react'

import { useBot } from '@/components/bot/BotProvider'
import { Button, Chip, Field, INPUT, Segmented } from '@/components/bot/ui'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { ago } from '@/lib/bot/view'
import { clock12, clockText, dayShort, hoursText, localClock, workedMinutes } from '@/lib/crew/time'
import { firstNameOf, type CrewEntry, type CrewJob, type CrewLang, type CrewPerson, type CrewShift, type CrewTask } from '@/lib/crew/types'
import { useCrewAdmin } from './useCrewAdmin'

// The owner's forms on the Crew tab. Each is mounted only while it is open.

export function AdminSheet({ title, onClose, children, tall = true }: { title: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
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

const AREA = `${INPUT} min-h-[72px] resize-y`

/** A labelled set of controls. Not a <label>: each checkbox inside carries its own. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">{label}</p>
      {children}
    </div>
  )
}

export function PeoplePicker({ value, onChange, people }: { value: string[]; onChange: (v: string[]) => void; people: CrewPerson[] }) {
  const active = people.filter((p) => p.active)
  if (!active.length) return <p className="text-sm text-[var(--color-charcoal-light)]">Nobody has a seat yet. Add people under Team.</p>
  const all = active.length > 1 && value.length === active.length
  return (
    <div className="rounded-xl border border-[var(--color-stone-mid)] bg-white">
      {active.length > 1 ? (
        <label className="flex min-h-11 items-center gap-3 border-b border-[var(--color-stone)] px-3 text-[13px] font-medium text-[var(--color-charcoal-light)]">
          <input type="checkbox" className="size-5" checked={all} onChange={(e) => onChange(e.target.checked ? active.map((p) => p.email) : [])} />
          Everyone
        </label>
      ) : null}
      {active.map((p) => (
        <label key={p.email} className="flex min-h-11 items-center gap-3 px-3 text-[15px] text-[var(--color-charcoal)]">
          <input
            type="checkbox"
            className="size-5"
            checked={value.includes(p.email)}
            onChange={(e) => onChange(e.target.checked ? [...value, p.email] : value.filter((x) => x !== p.email))}
          />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          {p.trade ? <span className="text-[12px] text-[var(--color-charcoal-light)]">{p.trade}</span> : null}
        </label>
      ))}
    </div>
  )
}

function JobSelect({ value, onChange, jobs, allowNone = false }: { value: string; onChange: (v: string) => void; jobs: CrewJob[]; allowNone?: boolean }) {
  const active = jobs.filter((j) => j.active || j.id === value)
  return (
    <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone ? <option value="">No job</option> : null}
      {!allowNone && !value ? <option value="">Choose a job</option> : null}
      {active.map((j) => (
        <option key={j.id} value={j.id}>
          {j.name}
        </option>
      ))}
    </select>
  )
}

// ---- schedule ---------------------------------------------------------------------

export function AssignSheet({ day, onClose, preset }: { day: string; onClose: () => void; preset?: { jobId: string; startTime: string; note: string } }) {
  const { data, run } = useCrewAdmin()
  const [jobId, setJobId] = useState(preset?.jobId ?? '')
  const [startTime, setStartTime] = useState(preset?.startTime ?? '06:00')
  const [note, setNote] = useState(preset?.note ?? '')
  const [emails, setEmails] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  if (!data) return null

  async function go() {
    if (!jobId) return setProblem('Choose a job.')
    if (!emails.length) return setProblem('Pick who is going.')
    setBusy(true)
    const res = await run({ kind: 'schedule.set', day, emails, jobId, startTime, note: note.trim() }, true)
    setBusy(false)
    if (!res.ok) return setProblem(res.text)
    onClose()
  }

  return (
    <AdminSheet title={`Who is where · ${dayShort(day)}`} onClose={onClose}>
      {data.jobs.some((j) => j.active) ? (
        <>
          <Field label="Job">
            <JobSelect value={jobId} onChange={setJobId} jobs={data.jobs} />
          </Field>
          <Field label="Start time" hint="Leave it empty if there is no set time.">
            <input type="time" className={INPUT} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Note for the crew" hint="What to bring, what the day is. They see it with the job.">
            <textarea className={AREA} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Group label="Who">
            <PeoplePicker value={emails} onChange={setEmails} people={data.people} />
          </Group>
          <Problem text={problem} />
          <Button variant="primary" full busy={busy} onClick={go} className="min-h-12">
            Put them on the schedule
          </Button>
        </>
      ) : (
        <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">Add a job first, under Team. Then you can put people on it.</p>
      )}
    </AdminSheet>
  )
}

// ---- tasks and questions ------------------------------------------------------------

export function TaskAddSheet({ onClose, to }: { onClose: () => void; to?: string }) {
  const { data, run } = useCrewAdmin()
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [jobId, setJobId] = useState('')
  const [due, setDue] = useState('')
  const [emails, setEmails] = useState<string[]>(to ? [to] : [])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  if (!data) return null

  async function go() {
    if (title.trim().length < 3) return setProblem('Say what the task is.')
    if (!emails.length) return setProblem('Pick who it is for.')
    setBusy(true)
    const res = await run({ kind: 'task.add', emails, title: title.trim(), detail: detail.trim(), jobId, due }, true)
    setBusy(false)
    if (!res.ok) return setProblem(res.text)
    onClose()
  }

  return (
    <AdminSheet title="Give someone a task" onClose={onClose}>
      <Field label="Task">
        <input className={INPUT} value={title} maxLength={160} placeholder="Pick up the hold-downs at White Cap" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Details (optional)">
        <textarea className={AREA} value={detail} maxLength={1500} onChange={(e) => setDetail(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Job (optional)">
          <JobSelect value={jobId} onChange={setJobId} jobs={data.jobs} allowNone />
        </Field>
        <Field label="Due (optional)">
          <input type="date" className={INPUT} value={due} min={data.day} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <Group label="Who">
        <PeoplePicker value={emails} onChange={setEmails} people={data.people} />
      </Group>
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} onClick={go} className="min-h-12">
        Assign it
      </Button>
    </AdminSheet>
  )
}

export function TaskSheet({ task, onClose }: { task: CrewTask; onClose: () => void }) {
  const { run, nameOf } = useCrewAdmin()
  const [busy, setBusy] = useState<string | null>(null)

  async function set(status: 'open' | 'done' | 'dropped') {
    setBusy(status)
    const res = await run({ kind: 'task.update', id: task.id, status })
    setBusy(null)
    if (res.ok) onClose()
  }

  return (
    <AdminSheet title={task.title} onClose={onClose} tall={false}>
      <p className="text-[13px] text-[var(--color-charcoal-light)]">
        {[nameOf(task.email), task.jobName, task.due ? `due ${dayShort(task.due)}` : '', `from ${task.createdBy}`].filter(Boolean).join(' · ')}
      </p>
      {task.detail ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-charcoal)]">{task.detail}</p> : null}
      {task.doneNote ? (
        <p className="rounded-xl bg-white px-3 py-2.5 text-[14px] leading-relaxed text-[var(--color-charcoal)]">
          <span className="font-medium">{firstNameOf(nameOf(task.email))}:</span> {task.doneNote}
        </p>
      ) : null}
      <Photos files={task.files} />
      <div className="grid grid-cols-2 gap-3">
        {task.status === 'done' || task.status === 'dropped' ? (
          <Button full busy={busy === 'open'} onClick={() => set('open')}>
            Reopen
          </Button>
        ) : (
          <>
            <Button variant="danger" busy={busy === 'dropped'} onClick={() => set('dropped')}>
              Drop it
            </Button>
            <Button variant="primary" busy={busy === 'done'} onClick={() => set('done')}>
              Mark done
            </Button>
          </>
        )}
      </div>
    </AdminSheet>
  )
}

export function AskSheet({ onClose, to }: { onClose: () => void; to?: string }) {
  const { data, run } = useCrewAdmin()
  const [body, setBody] = useState('')
  const [options, setOptions] = useState('')
  const [emails, setEmails] = useState<string[]>(to ? [to] : [])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  if (!data) return null

  async function go() {
    if (body.trim().length < 3) return setProblem('Write the question.')
    if (!emails.length) return setProblem('Pick who to ask.')
    setBusy(true)
    const res = await run({
      kind: 'question.ask',
      emails,
      body: body.trim(),
      options: options
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .slice(0, 4),
    })
    setBusy(false)
    if (!res.ok) return setProblem(res.text)
    onClose()
  }

  return (
    <AdminSheet title="Ask the crew" onClose={onClose}>
      <p className="text-sm leading-relaxed text-[var(--color-charcoal-light)]">
        It shows at the top of their app and buzzes their phone. Their answer comes back here.
      </p>
      <Field label="Question">
        <textarea className={AREA} value={body} maxLength={600} placeholder="Did the shear inspection pass?" onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Field label="One-tap answers (optional)" hint="Separate with commas: Yes, No, Not yet">
        <input className={INPUT} value={options} onChange={(e) => setOptions(e.target.value)} />
      </Field>
      <Group label="Who">
        <PeoplePicker value={emails} onChange={setEmails} people={data.people} />
      </Group>
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} onClick={go} className="min-h-12">
        Ask
      </Button>
    </AdminSheet>
  )
}

// ---- time ---------------------------------------------------------------------------

const HOW: Record<string, string> = {
  app: 'tapped in the app',
  late: 'tapped with no signal, sent later',
  reported: 'time given afterwards',
  office: 'entered by the office',
}

function mapLink(geo: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lng}`
}

export function ShiftSheet({ shift, onClose }: { shift: CrewShift; onClose: () => void }) {
  const { data, run, nameOf } = useCrewAdmin()
  const [start, setStart] = useState(localClock(shift.startedAt))
  const [end, setEnd] = useState(shift.endedAt ? localClock(shift.endedAt) : '')
  const [lunch, setLunch] = useState(String(shift.breakMin))
  const [jobId, setJobId] = useState(shift.jobId)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState('')
  if (!data) return null
  const voided = shift.status === 'void'
  const knownJob = data.jobs.some((j) => j.id === shift.jobId)

  async function save() {
    // Only what was actually changed is sent, so an untouched time keeps its seconds.
    const change = {
      ...(start !== localClock(shift.startedAt) ? { start } : {}),
      ...(end !== (shift.endedAt ? localClock(shift.endedAt) : '') ? { end } : {}),
      ...((Number(lunch) || 0) !== shift.breakMin ? { breakMin: Number(lunch) || 0 } : {}),
      ...(knownJob && jobId !== shift.jobId ? { jobId } : {}),
    }
    if (!Object.keys(change).length) return setProblem('Nothing is changed yet.')
    if (why.trim().length < 3) return setProblem('Say why you are changing it. It is kept with the shift.')
    setBusy('save')
    const res = await run({ kind: 'shift.edit', id: shift.id, ...change, why: why.trim() }, true)
    setBusy(null)
    if (!res.ok) return setProblem(res.text)
    onClose()
  }

  async function remove() {
    if (why.trim().length < 3) return setProblem('Say why you are removing it.')
    setBusy('void')
    const res = await run({ kind: 'shift.void', id: shift.id, why: why.trim() }, true)
    setBusy(null)
    if (!res.ok) return setProblem(res.text)
    onClose()
  }

  async function fine() {
    setBusy('ok')
    const res = await run({ kind: 'shift.ok', id: shift.id }, true)
    setBusy(null)
    if (res.ok) onClose()
  }

  return (
    <AdminSheet title={`${nameOf(shift.email)} · ${dayShort(shift.day)}`} onClose={onClose}>
      <p className="text-[14px] leading-relaxed text-[var(--color-charcoal)]">
        {shift.jobName} · {clock12(shift.startedAt)} – {shift.endedAt ? clock12(shift.endedAt) : 'still on the clock'} ·{' '}
        {hoursText(workedMinutes(shift))}
      </p>
      <p className="text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">
        In: {HOW[shift.source] ?? shift.source}
        {shift.startGeo ? (
          <>
            {' '}
            (
            <a className="underline" href={mapLink(shift.startGeo)} target="_blank" rel="noreferrer">
              where
            </a>
            )
          </>
        ) : null}
        {shift.endedAt ? (
          <>
            {' · '}Out: {HOW[shift.endSource ?? 'app'] ?? shift.endSource}
            {shift.endGeo ? (
              <>
                {' '}
                (
                <a className="underline" href={mapLink(shift.endGeo)} target="_blank" rel="noreferrer">
                  where
                </a>
                )
              </>
            ) : null}
          </>
        ) : null}
      </p>
      {shift.note ? <p className="text-[13px] text-[var(--color-charcoal)]">Note: {shift.note}</p> : null}
      {shift.review ? (
        <div className="rounded-xl px-3 py-2.5 text-[13px] leading-relaxed" style={{ backgroundColor: 'rgba(212,175,55,0.20)', color: '#6b5010' }}>
          Worth a look: {shift.review}.
          <Button className="mt-2" busy={busy === 'ok'} onClick={fine}>
            It is fine as it is
          </Button>
        </div>
      ) : null}

      {voided ? (
        <Chip tone="bad">Removed</Chip>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="In">
              <input type="time" className={INPUT} value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Out" hint="Empty puts them back on the clock.">
              <input type="time" className={INPUT} value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Break (min, unpaid)">
              <input className={INPUT} inputMode="numeric" value={lunch} onChange={(e) => setLunch(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            </Field>
            {knownJob ? (
              <Field label="Job">
                <JobSelect value={jobId} onChange={setJobId} jobs={data.jobs} />
              </Field>
            ) : null}
          </div>
          <Field label="Why the change">
            <input className={INPUT} value={why} maxLength={300} placeholder="Forgot to clock out; left at 2:30" onChange={(e) => setWhy(e.target.value)} />
          </Field>
          <Problem text={problem} />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="danger" busy={busy === 'void'} onClick={remove}>
              Remove shift
            </Button>
            <Button variant="primary" busy={busy === 'save'} onClick={save}>
              Save change
            </Button>
          </div>
        </>
      )}

      {shift.edits.length ? (
        <div className="border-t border-[var(--color-stone)] pt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-charcoal-light)]">Changes</p>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">
            {shift.edits.map((e, i) => (
              <li key={i}>
                {e.by}, {ago(e.at)}: {e.why.replace(/[.\s]+$/, '')}. Was {clock12(e.was.startedAt)} – {e.was.endedAt ? clock12(e.was.endedAt) : 'open'}, {e.was.breakMin} min break,{' '}
                {e.was.jobName}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AdminSheet>
  )
}

export function ShiftAddSheet({ onClose, day, email }: { onClose: () => void; day: string; email?: string }) {
  const { data, run } = useCrewAdmin()
  const [who, setWho] = useState(email ?? '')
  const [date, setDate] = useState(day)
  const [jobId, setJobId] = useState('')
  const [start, setStart] = useState('06:00')
  const [end, setEnd] = useState('14:30')
  const [lunch, setLunch] = useState('30')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  if (!data) return null

  async function go() {
    if (!who) return setProblem('Choose who.')
    if (!jobId) return setProblem('Choose a job.')
    if (why.trim().length < 3) return setProblem('Say why you are entering it by hand. It is kept with the shift.')
    setBusy(true)
    const res = await run({ kind: 'shift.add', email: who, jobId, day: date, start, end, breakMin: Number(lunch) || 0, why: why.trim() }, true)
    setBusy(false)
    if (!res.ok) return setProblem(res.text)
    onClose()
  }

  return (
    <AdminSheet title="Enter a shift by hand" onClose={onClose}>
      <Field label="Who">
        <select className={INPUT} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Choose a person</option>
          {data.people.map((p) => (
            <option key={p.email} value={p.email}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day">
          <input type="date" className={INPUT} value={date} max={data.day} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Job">
          <JobSelect value={jobId} onChange={setJobId} jobs={data.jobs} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="In">
          <input type="time" className={INPUT} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Out">
          <input type="time" className={INPUT} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Break min">
          <input className={INPUT} inputMode="numeric" value={lunch} onChange={(e) => setLunch(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </Field>
      </div>
      <Field label="Why">
        <input className={INPUT} value={why} maxLength={300} placeholder="Phone was dead; hours from the foreman" onChange={(e) => setWhy(e.target.value)} />
      </Field>
      <Problem text={problem} />
      <Button variant="primary" full busy={busy} onClick={go} className="min-h-12">
        Add the shift
      </Button>
    </AdminSheet>
  )
}

export function FixSheet({ entry, onClose }: { entry: CrewEntry; onClose: () => void }) {
  const { data, run, nameOf } = useCrewAdmin()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null)
  const [problem, setProblem] = useState('')
  const d = entry.data
  const start = typeof d.start === 'string' ? d.start : ''
  const end = typeof d.end === 'string' ? d.end : ''
  const breakMin = typeof d.breakMin === 'number' ? d.breakMin : 0
  const current = typeof d.shiftId === 'number' ? data?.shifts.find((s) => s.id === d.shiftId) : undefined

  async function decide(approve: boolean) {
    setBusy(approve ? 'yes' : 'no')
    const res = await run({ kind: 'fix.decide', id: entry.id, approve, note: note.trim() }, true)
    setBusy(null)
    if (!res.ok) return setProblem(res.text)
    onClose()
  }

  return (
    <AdminSheet title={`Time fix · ${firstNameOf(nameOf(entry.email))}`} onClose={onClose}>
      <div className="rounded-xl bg-white px-3.5 py-3 text-[14px] leading-relaxed text-[var(--color-charcoal)]">
        <p>
          <span className="font-medium">{dayShort(entry.day)}</span> · {entry.jobName}
        </p>
        <p>
          Asks for {clockText(start)} – {clockText(end)}
          {breakMin ? `, ${breakMin} min break` : ''}.
        </p>
        <p className="mt-1 text-[13px] text-[var(--color-charcoal-light)]">
          {current
            ? `The app has ${clock12(current.startedAt)} – ${current.endedAt ? clock12(current.endedAt) : 'still open'}, ${current.breakMin} min break.`
            : 'There is no shift for this in the app. Approving adds one.'}
        </p>
        <p className="mt-2 whitespace-pre-wrap">&ldquo;{entry.body}&rdquo;</p>
      </div>
      <Field label="Note back to them (optional)">
        <input className={INPUT} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Problem text={problem} />
      <div className="grid grid-cols-2 gap-3">
        <Button variant="danger" busy={busy === 'no'} disabled={!!busy} onClick={() => decide(false)} className="min-h-12">
          Do not approve
        </Button>
        <Button variant="primary" busy={busy === 'yes'} disabled={!!busy} onClick={() => decide(true)} className="min-h-12">
          Approve
        </Button>
      </div>
    </AdminSheet>
  )
}

// ---- people and jobs ----------------------------------------------------------------

export function PersonSheet({ person, onClose }: { person: CrewPerson | null; onClose: () => void }) {
  const { run } = useCrewAdmin()
  const { toast } = useBot()
  const [name, setName] = useState(person?.name ?? '')
  const [email, setEmail] = useState(person?.email ?? '')
  const [lang, setLang] = useState<CrewLang>(person?.lang ?? 'en')
  const [trade, setTrade] = useState(person?.trade ?? '')
  const [phone, setPhone] = useState(person?.phone ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState('')
  const [code, setCode] = useState<{ code: string; link: string; hours: number } | null>(null)

  async function save(invite: boolean) {
    if (name.trim().length < 2) return setProblem('Type their name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setProblem('Type the email they use on their phone.')
    setBusy(invite ? 'invite' : 'save')
    const res = person
      ? await run({ kind: 'person.update', email: person.email, name: name.trim(), lang, trade: trade.trim(), phone: phone.trim() }, true)
      : await run({ kind: 'person.add', name: name.trim(), email: email.trim(), lang, trade: trade.trim(), phone: phone.trim(), invite })
    setBusy(null)
    if (!res.ok) return setProblem(res.text)
    onClose()
  }

  async function act(kind: 'person.invite' | 'person.code' | 'off' | 'on') {
    if (!person) return
    setBusy(kind)
    setProblem('')
    if (kind === 'person.code') {
      const res = await run({ kind, email: person.email }, true)
      if (res.ok && res.code && res.link) setCode({ code: res.code, link: res.link, hours: res.hours ?? 24 })
      else setProblem(res.text || 'Could not make a code.')
    } else if (kind === 'person.invite') {
      await run({ kind, email: person.email })
    } else {
      const res = await run({ kind: 'person.update', email: person.email, active: kind === 'on' }, true)
      if (res.ok) onClose()
      else setProblem(res.text)
    }
    setBusy(null)
  }

  async function shareLink() {
    if (!code) return
    try {
      if (navigator.share) await navigator.share({ title: 'Saddlewood app', text: `${firstNameOf(name)}, tap this to open the Saddlewood app:`, url: code.link })
      else {
        await navigator.clipboard.writeText(code.link)
        toast('Link copied.', 'ok')
      }
    } catch {
      // closed the share sheet
    }
  }

  return (
    <AdminSheet title={person ? person.name : 'Add a person'} onClose={onClose}>
      {person && !person.active ? <Chip tone="bad">No seat right now</Chip> : null}
      <Field label="Name">
        <input className={INPUT} value={name} maxLength={80} autoCapitalize="words" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email" hint={person ? 'The address their seat is under. To change it, add them again under the new one.' : 'The one they read on their phone. Their sign-in code goes there.'}>
        <input
          className={INPUT}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          disabled={!!person}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">Their app is in</p>
        <Segmented
          label="Language"
          value={lang}
          onChange={setLang}
          options={[
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Español' },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Trade (optional)">
          <input className={INPUT} value={trade} maxLength={60} placeholder="Framer" onChange={(e) => setTrade(e.target.value)} />
        </Field>
        <Field label="Phone (optional)">
          <input className={INPUT} type="tel" inputMode="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <Problem text={problem} />

      {person ? (
        <>
          <Button variant="primary" full busy={busy === 'save'} onClick={() => save(false)} className="min-h-12">
            Save
          </Button>
          {person.active ? (
            <div className="space-y-2.5 border-t border-[var(--color-stone)] pt-4">
              <p className="text-[13px] leading-relaxed text-[var(--color-charcoal-light)]">
                {person.lastSeenAt ? `Opened the app ${ago(person.lastSeenAt)}.` : 'Has not opened the app yet.'} They sign in with their email and a code that is emailed to them.
              </p>
              <Button full busy={busy === 'person.invite'} onClick={() => act('person.invite')}>
                <Mail className="size-4" aria-hidden="true" /> Email them the sign-in link
              </Button>
              <Button full busy={busy === 'person.code'} onClick={() => act('person.code')}>
                Get a code to give them in person
              </Button>
              {code ? (
                <div className="rounded-xl bg-white px-3.5 py-3">
                  <p className="text-[12px] text-[var(--color-charcoal-light)]">
                    On their phone: open the app, type their email, tap &ldquo;I already have a code&rdquo;, and enter:
                  </p>
                  <p className="my-1.5 font-mono text-2xl tracking-[0.2em] text-[var(--color-charcoal)]">{code.code}</p>
                  <p className="text-[12px] text-[var(--color-charcoal-light)]">Works once, for {code.hours} hours. Asking for another one cancels this one.</p>
                  <div className="mt-2.5 flex gap-2">
                    <Button onClick={shareLink}>
                      <Share2 className="size-4" aria-hidden="true" /> Text them a link instead
                    </Button>
                    <Button
                      variant="quiet"
                      aria-label="Copy the code"
                      onClick={() => navigator.clipboard.writeText(code.code).then(() => toast('Code copied.', 'ok'), () => {})}
                    >
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ) : null}
              <Button variant="danger" full busy={busy === 'off'} onClick={() => act('off')}>
                Take their seat away
              </Button>
            </div>
          ) : (
            <Button full busy={busy === 'on'} onClick={() => act('on')}>
              Give the seat back
            </Button>
          )}
        </>
      ) : (
        <>
          <Button variant="primary" full busy={busy === 'invite'} disabled={!!busy} onClick={() => save(true)} className="min-h-12">
            Add and email them the link
          </Button>
          <Button full busy={busy === 'save'} disabled={!!busy} onClick={() => save(false)}>
            Add without emailing
          </Button>
          <p className="text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">
            A crew seat opens the app only: their own hours, receipts, photos, schedule and tasks. Nothing in the portal, and no access to the bot.
          </p>
        </>
      )}
    </AdminSheet>
  )
}

export function JobSheet({ job, onClose, suggested = '' }: { job: CrewJob | null; onClose: () => void; suggested?: string }) {
  const { run } = useCrewAdmin()
  const [name, setName] = useState(job?.name ?? suggested)
  const [address, setAddress] = useState(job?.address ?? '')
  const [note, setNote] = useState(job?.note ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState('')

  async function save() {
    if (name.trim().length < 2) return setProblem('Name the job.')
    setBusy('save')
    const res = job
      ? await run({ kind: 'job.update', id: job.id, name: name.trim(), address: address.trim(), note: note.trim() }, true)
      : await run({ kind: 'job.add', name: name.trim(), address: address.trim(), note: note.trim() })
    setBusy(null)
    if (!res.ok) return setProblem(res.text)
    onClose()
  }

  async function setActive(active: boolean) {
    if (!job) return
    setBusy('active')
    const res = await run({ kind: 'job.update', id: job.id, active }, true)
    setBusy(null)
    if (res.ok) onClose()
    else setProblem(res.text)
  }

  return (
    <AdminSheet title={job ? job.name : 'Add a job'} onClose={onClose}>
      <Field label="Job name" hint="What the crew calls it. Receipts and hours are filed under this name.">
        <input className={INPUT} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Address" hint="Gives the crew a Directions button.">
        <input className={INPUT} value={address} maxLength={200} autoComplete="off" onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <Field label="Site note" hint="Gate code, parking, who the super is. Only people scheduled or clocked in there see it.">
        <textarea className={AREA} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Problem text={problem} />
      <Button variant="primary" full busy={busy === 'save'} onClick={save} className="min-h-12">
        {job ? 'Save' : 'Add the job'}
      </Button>
      {job ? (
        <Button full variant={job.active ? 'danger' : 'secondary'} busy={busy === 'active'} onClick={() => setActive(!job.active)}>
          {job.active ? 'Take it off the list (job is done)' : 'Put it back on the list'}
        </Button>
      ) : null}
    </AdminSheet>
  )
}

// ---- what came in from the field ------------------------------------------------------

export function Photos({ files }: { files: { path: string; name: string; type: string }[] }) {
  if (!files.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => {
        const href = `/api/bot/files?path=${encodeURIComponent(f.path)}`
        return (
          <a key={f.path} href={href} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)]">
            {f.type.startsWith('image/') ? (
              // A short-lived signed link behind a redirect: nothing for next/image to optimize.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={href} alt={f.name} loading="lazy" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center px-1 text-center text-[10px] text-[var(--color-charcoal-light)]">{f.name}</span>
            )}
          </a>
        )
      })}
    </div>
  )
}

const KIND: Record<CrewEntry['kind'], string> = {
  receipt: 'Receipt',
  progress: 'Progress',
  eod: 'End of day',
  note: 'Note',
  timefix: 'Time fix',
}

const EOD_FIELDS: [string, string][] = [
  ['stuck', 'Stuck'],
  ['needs', 'Needs for tomorrow'],
  ['asked', 'Extra work asked for'],
  ['deliveries', 'Deliveries'],
  ['visits', 'Inspections and visitors'],
  ['safety', 'Safety'],
  ['decision', 'Needs a decision'],
]

export function EntryCard({ entry, onFix }: { entry: CrewEntry; onFix?: () => void }) {
  const { nameOf, data } = useCrewAdmin()
  const d = entry.data
  const text = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '')
  const typed = typeof d.amount === 'number' ? d.amount : null
  const read = typeof entry.bot.amount === 'number' ? entry.bot.amount : null
  const amount = read ?? typed
  const vendor = (typeof entry.bot.vendor === 'string' && entry.bot.vendor) || text('vendor')
  const botNote = typeof entry.bot.note === 'string' ? entry.bot.note : ''
  const alarm = entry.kind === 'eod' && (text('safety') || text('asked'))

  return (
    <div className="px-4 py-3.5">
      <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-charcoal-light)]">
        <span className="font-medium text-[var(--color-charcoal)]">{firstNameOf(nameOf(entry.email))}</span>
        <Chip tone={alarm ? 'bad' : entry.kind === 'receipt' ? 'warn' : 'quiet'}>{KIND[entry.kind]}</Chip>
        {entry.jobName ? <span>{entry.jobName}</span> : null}
        <span>
          · {entry.day === data?.day ? clock12(entry.createdAt) : `${dayShort(entry.day)}, ${clock12(entry.createdAt)}`}
        </span>
      </p>

      {entry.kind === 'receipt' ? (
        <p className="mt-1.5 text-[15px] leading-snug text-[var(--color-charcoal)]">
          {[vendor, amount !== null && amount > 0 ? `$${amount.toFixed(2)}` : 'amount not read yet'].filter(Boolean).join(' · ')}
          {d.paidBy === 'me' ? (
            <>
              {' '}
              <Chip tone="bad">Paid out of pocket: owed to {firstNameOf(nameOf(entry.email))}</Chip>
            </>
          ) : null}
        </p>
      ) : null}

      {entry.kind === 'timefix' ? (
        <p className="mt-1.5 text-[15px] leading-snug text-[var(--color-charcoal)]">
          {dayShort(entry.day)}: {clockText(text('start'))} – {clockText(text('end'))}{' '}
          <Chip tone={entry.status === 'approved' ? 'ok' : entry.status === 'denied' ? 'bad' : 'warn'}>
            {entry.status === 'approved' ? `Approved by ${entry.decidedBy}` : entry.status === 'denied' ? `Not approved by ${entry.decidedBy}` : 'Waiting on you'}
          </Chip>
        </p>
      ) : null}

      {entry.body ? <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-charcoal)]">{entry.body}</p> : null}

      {entry.kind === 'eod' ? (
        <dl className="mt-2 space-y-1.5">
          {EOD_FIELDS.filter(([k]) => text(k)).map(([k, label]) => (
            <div key={k} className="text-[14px] leading-relaxed">
              <dt className="inline font-medium" style={{ color: k === 'safety' || k === 'asked' ? '#9a2a1f' : 'var(--color-charcoal)' }}>
                {label}:{' '}
              </dt>
              <dd className="inline whitespace-pre-wrap text-[var(--color-charcoal)]">{text(k)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {entry.files.length ? (
        <div className="mt-2.5">
          <Photos files={entry.files} />
        </div>
      ) : null}

      {botNote ? <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">Bot: {botNote}</p> : null}
      {entry.kind === 'timefix' && entry.status === 'new' && onFix ? (
        <Button variant="primary" className="mt-2.5" onClick={onFix}>
          Decide
        </Button>
      ) : null}
    </div>
  )
}
