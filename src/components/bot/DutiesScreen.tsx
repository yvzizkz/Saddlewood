'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Pause, Play, Plus, Repeat, Trash2, Zap } from 'lucide-react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { botApi, useBot } from './BotProvider'
import { Button, Card, Chip, Dot, Empty, Field, INPUT, ScreenTitle, SectionTitle, Segmented } from './ui'
import {
  CADENCE_TYPES,
  describeCadence,
  type BotDuty,
  type BotTask,
  type Cadence,
  type CadenceType,
} from '@/lib/bot/types'
import { dayTime, firstName, personFor, shortDate } from '@/lib/bot/view'

// Delegation with a memory. Three kinds of duty:
//   To-dos      work a person owes; the bot reminds, and can take it on
//   Recurring   an instruction the bot carries out on a schedule
//   Built in    the jobs it already runs every day, and whether they ran

type Tab = 'todos' | 'recurring' | 'builtin'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const CADENCE_LABEL: Record<CadenceType, string> = {
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Once a week',
  monthly: 'Once a month',
}

function plusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function SheetTitle({ children }: { children: string }) {
  return (
    <p role="heading" aria-level={2} className="text-lg text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
      {children}
    </p>
  )
}

function TaskCard({ task, owner, onSnooze }: { task: BotTask; owner: boolean; onSnooze: () => void }) {
  const { home, act, busy, toast } = useBot()
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [handing, setHanding] = useState(false)
  const key = `task:${task.id}`
  const working = !!busy[key]
  const who = personFor(task.owner, home?.names ?? {})
  const tone = task.rank === 0 ? 'bad' : task.rank === 1 ? 'warn' : 'quiet'

  async function handOff() {
    setHanding(true)
    try {
      await botApi('/api/bot/messages', {
        method: 'POST',
        body: JSON.stringify({
          body: `Take this to-do as far as you can and tell me what is left: "${task.title}" (id: ${task.id}).`,
          attachments: [],
        }),
      })
      router.push('/app/ask')
    } catch (e) {
      toast((e as Error).message, 'bad')
      setHanding(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {task.dueLabel ? <Chip tone={tone}>{task.dueLabel}</Chip> : null}
        {task.hidden && task.remindFrom ? <Chip>Quiet until {shortDate(task.remindFrom)}</Chip> : null}
        {who ? <Chip tone="ink">{who}</Chip> : null}
        {task.tag ? <span className="font-mono text-[11px] text-[var(--color-charcoal-light)]">{task.tag}</span> : null}
      </div>
      <p className="mt-2 text-[16px] font-medium leading-snug text-[var(--color-charcoal)]">{task.title}</p>
      {task.next ? (
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-charcoal)]">
          <span className="font-semibold">Next: </span>
          {task.next}
        </p>
      ) : null}
      {task.help ? (
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-charcoal-light)]">
          <span className="font-semibold text-[var(--color-charcoal)]">The bot can: </span>
          {task.help}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" busy={handing} onClick={handOff}>
          <Zap className="size-4" aria-hidden="true" /> Hand to the bot
        </Button>
        {owner ? (
          <>
            <Button
              busy={working}
              disabled={!home?.bridge.online}
              onClick={() => act({ kind: 'task.done', payload: { id: task.id, reason: `marked done in the app by ${home?.me.name ?? 'an owner'}` } }, key)}
            >
              Done
            </Button>
            <Button disabled={working || !home?.bridge.online} onClick={onSnooze}>
              Snooze
            </Button>
            {armed ? (
              <Button
                variant="danger"
                busy={working}
                onClick={() => act({ kind: 'task.drop', payload: { id: task.id, reason: `dropped in the app by ${home?.me.name ?? 'an owner'}` } }, key)}
              >
                Yes, drop it
              </Button>
            ) : (
              <Button
                variant="quiet"
                disabled={working || !home?.bridge.online}
                onClick={() => {
                  setArmed(true)
                  window.setTimeout(() => setArmed(false), 7000)
                }}
              >
                Drop
              </Button>
            )}
          </>
        ) : null}
      </div>
    </Card>
  )
}

function SnoozeSheet({ task, onClose }: { task: BotTask | null; onClose: () => void }) {
  const { act, busy } = useBot()
  const [until, setUntil] = useState(() => plusDays(7))
  if (!task) return null
  const key = `task:${task.id}`
  return (
    <BottomSheet isOpen narrow onClose={onClose} maxHeightDvh={70} ariaLabel="Snooze a to-do">
      <div className="ph-no-capture px-5 pb-6 pt-1">
        <SheetTitle>Quiet until when?</SheetTitle>
        <p className="mt-1.5 text-sm text-[var(--color-charcoal-light)]">{task.title}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ['Tomorrow', 1],
            ['In 3 days', 3],
            ['Next week', 7],
            ['In a month', 30],
          ].map(([label, days]) => (
            <Button key={label} onClick={() => setUntil(plusDays(days as number))}>
              {label}
            </Button>
          ))}
        </div>
        <div className="mt-3">
          <Field label="Or pick the day it comes back">
            <input type="date" className={INPUT} value={until} min={plusDays(1)} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </div>
        <Button
          variant="primary"
          full
          className="mt-4"
          busy={!!busy[key]}
          disabled={!/^\d{4}-\d{2}-\d{2}$/.test(until)}
          onClick={async () => {
            const res = await act({ kind: 'task.snooze', payload: { id: task.id, until } }, key)
            if (res.ok) onClose()
          }}
        >
          Snooze until {shortDate(until)}
        </Button>
      </div>
    </BottomSheet>
  )
}

function AddTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { home, act, busy } = useBot()
  const [title, setTitle] = useState('')
  const [next, setNext] = useState('')
  const [owner, setOwner] = useState(home?.me.email ?? '')
  const [due, setDue] = useState('')
  if (!open) return null
  return (
    <BottomSheet isOpen narrow onClose={onClose} maxHeightDvh={92} ariaLabel="Add a to-do">
      <div className="ph-no-capture flex flex-col gap-3.5 px-5 pb-6 pt-1">
        <SheetTitle>New to-do</SheetTitle>
        <Field label="What has to happen">
          <input className={INPUT} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="Get the COI to McCully" />
        </Field>
        <Field label="The next concrete step" hint="One action. The daily digest repeats it word for word.">
          <textarea className={INPUT} rows={3} value={next} maxLength={600} onChange={(e) => setNext(e.target.value)} placeholder="Call Jerry for the corrected certificate" />
        </Field>
        <Field label="Whose is it">
          <select className={INPUT} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Nobody yet</option>
            {home?.team.map((t) => (
              <option key={t.email} value={t.email}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due (optional)">
          <input type="date" className={INPUT} value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Button
          variant="primary"
          full
          busy={!!busy['task:add']}
          disabled={title.trim().length < 3}
          onClick={async () => {
            const res = await act({ kind: 'task.add', payload: { title: title.trim(), next: next.trim(), owner, due, remindFrom: '' } }, 'task:add')
            if (res.ok) onClose()
          }}
        >
          Add it
        </Button>
      </div>
    </BottomSheet>
  )
}

function AddDutySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { act, busy } = useBot()
  const [title, setTitle] = useState('')
  const [instruction, setInstruction] = useState('')
  const [type, setType] = useState<CadenceType>('weekdays')
  const [time, setTime] = useState('07:00')
  const [weekday, setWeekday] = useState(1)
  const [monthday, setMonthday] = useState(1)
  if (!open) return null
  const cadence: Cadence = {
    type,
    time,
    ...(type === 'weekly' ? { weekday } : {}),
    ...(type === 'monthly' ? { monthday } : {}),
  }
  const valid = title.trim().length >= 3 && instruction.trim().length >= 10 && /^\d{2}:\d{2}$/.test(time)
  return (
    <BottomSheet isOpen narrow onClose={onClose} maxHeightDvh={92} ariaLabel="Give the bot a recurring duty">
      <div className="ph-no-capture flex flex-col gap-3.5 px-5 pb-6 pt-1">
        <SheetTitle>New recurring duty</SheetTitle>
        <p className="-mt-1.5 text-sm leading-relaxed text-[var(--color-charcoal-light)]">
          The bot does this on schedule and reports in your Ask thread. If it wants to email anyone outside, that still
          comes to you as a draft first.
        </p>
        <Field label="Name">
          <input className={INPUT} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Unpaid invoices check" />
        </Field>
        <Field label="What should it do each time" hint="Write it like you would text it. Say what you want back.">
          <textarea
            className={INPUT}
            rows={5}
            value={instruction}
            maxLength={1500}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="List every invoice more than 30 days unpaid, with the client, amount and last contact. Draft a polite follow-up for each one that has had no contact in two weeks."
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How often">
            <select className={INPUT} value={type} onChange={(e) => setType(e.target.value as CadenceType)}>
              {CADENCE_TYPES.map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="At (Phoenix time)">
            <input type="time" className={INPUT} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {type === 'weekly' ? (
          <Field label="On">
            <select className={INPUT} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {type === 'monthly' ? (
          <Field label="Day of the month" hint="1 to 28, so it exists in every month.">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={28}
              className={INPUT}
              value={monthday}
              onChange={(e) => setMonthday(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
            />
          </Field>
        ) : null}
        <p className="rounded-xl bg-[var(--color-cream)] px-3.5 py-2.5 text-sm text-[var(--color-charcoal)]">
          <Repeat className="mr-1.5 inline size-4 align-[-3px]" aria-hidden="true" />
          {valid ? describeCadence(cadence) : 'Fill in the name, what to do, and a time.'}
        </p>
        <Button
          variant="primary"
          full
          busy={!!busy['duty:add']}
          disabled={!valid}
          onClick={async () => {
            const res = await act({ kind: 'duty.add', payload: { title: title.trim(), instruction: instruction.trim(), cadence } }, 'duty:add')
            if (res.ok) onClose()
          }}
        >
          Give it to the bot
        </Button>
      </div>
    </BottomSheet>
  )
}

function DutyCard({ duty }: { duty: BotDuty }) {
  const { home, act, busy } = useBot()
  const [armed, setArmed] = useState(false)
  const key = `duty:${duty.id}`
  const working = !!busy[key]
  const online = !!home?.bridge.online
  const active = duty.status === 'active'
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={active ? 'ok' : 'quiet'}>{active ? 'Active' : 'Paused'}</Chip>
        <Chip>
          <Repeat className="size-3" aria-hidden="true" /> {duty.cadenceText}
        </Chip>
        {duty.ownerName ? <Chip tone="ink">{firstName(duty.ownerName)}</Chip> : null}
      </div>
      <p className="mt-2 text-[16px] font-medium leading-snug text-[var(--color-charcoal)]">{duty.title}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-charcoal)]">{duty.instruction}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[var(--color-charcoal-light)]">
        {active && duty.nextRun ? (
          <span>
            <CalendarClock className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
            Next {dayTime(duty.nextRun)}
          </span>
        ) : null}
        {duty.lastRun ? (
          <span>
            Last ran {dayTime(duty.lastRun)}
            {duty.lastResult && duty.lastResult !== 'ok' ? ` (${duty.lastResult})` : ''}
          </span>
        ) : (
          <span>Has not run yet</span>
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button busy={working} disabled={!online} onClick={() => act({ kind: 'duty.run', payload: { id: duty.id } }, key)}>
          <Zap className="size-4" aria-hidden="true" /> Run now
        </Button>
        <Button
          disabled={working || !online}
          onClick={() => act({ kind: active ? 'duty.pause' : 'duty.resume', payload: { id: duty.id } }, key)}
        >
          {active ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          {active ? 'Pause' : 'Resume'}
        </Button>
        {armed ? (
          <Button variant="danger" busy={working} onClick={() => act({ kind: 'duty.delete', payload: { id: duty.id } }, key)}>
            Yes, remove it
          </Button>
        ) : (
          <Button
            variant="quiet"
            aria-label={`Remove ${duty.title}`}
            disabled={working || !online}
            onClick={() => {
              setArmed(true)
              window.setTimeout(() => setArmed(false), 7000)
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </Card>
  )
}

export default function DutiesScreen() {
  const { home, error } = useBot()
  const [tab, setTab] = useState<Tab>('todos')
  const [snoozing, setSnoozing] = useState<BotTask | null>(null)
  const [addingTask, setAddingTask] = useState(false)
  const [addingDuty, setAddingDuty] = useState(false)

  if (!home) {
    return (
      <div className="px-4 pt-6">
        <ScreenTitle title="Duties" />
        {error ? <Empty>Could not load: {error}</Empty> : <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-cream)]" aria-hidden="true" />}
      </div>
    )
  }

  const owner = home.me.role === 'owner'
  const { tasks, duties, automations } = home.sections
  const now = tasks.filter((t) => !t.hidden)
  const later = tasks.filter((t) => t.hidden)
  const failed = automations.filter((a) => a.state === 'failed').length

  return (
    <div className="px-4 pt-6 pb-8">
      <ScreenTitle eyebrow="Who does what" title="Duties" />
      <Segmented<Tab>
        label="Kind of duty"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'todos', label: 'To-dos', count: now.length },
          { value: 'recurring', label: 'Recurring', count: duties.length },
          ...(owner ? [{ value: 'builtin' as const, label: 'Built in', count: failed }] : []),
        ]}
      />

      {tab === 'todos' ? (
        <div className="mt-5">
          {owner ? (
            <Button full disabled={!home.bridge.online} onClick={() => setAddingTask(true)}>
              <Plus className="size-4" aria-hidden="true" /> Add a to-do
            </Button>
          ) : null}
          <div className="mt-3 flex flex-col gap-3">
            {now.length ? (
              now.map((t) => <TaskCard key={t.id} task={t} owner={owner} onSnooze={() => setSnoozing(t)} />)
            ) : (
              <Empty>No open to-dos. The bot repeats these in the morning digest until someone finishes them.</Empty>
            )}
          </div>
          {later.length ? (
            <>
              <SectionTitle count={later.length}>Quiet for now</SectionTitle>
              <div className="flex flex-col gap-3">
                {later.map((t) => (
                  <TaskCard key={t.id} task={t} owner={owner} onSnooze={() => setSnoozing(t)} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'recurring' ? (
        <div className="mt-5">
          {owner ? (
            <Button full disabled={!home.bridge.online} onClick={() => setAddingDuty(true)}>
              <Plus className="size-4" aria-hidden="true" /> Give the bot a recurring duty
            </Button>
          ) : null}
          <div className="mt-3 flex flex-col gap-3">
            {duties.length ? (
              duties.map((d) => <DutyCard key={d.id} duty={d} />)
            ) : (
              <Empty>
                Nothing on a schedule yet. A recurring duty is an instruction the bot carries out on its own, like
                &ldquo;every Friday at 3, list what is unpaid past 30 days and draft the follow-ups.&rdquo;
              </Empty>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'builtin' && owner ? (
        <div className="mt-5">
          <p className="mb-3 text-sm leading-relaxed text-[var(--color-charcoal-light)]">
            What the bot already does on its own, every day, and whether the last run went through.
          </p>
          {automations.length ? (
            <Card className="divide-y divide-[var(--color-stone)]">
              {automations.map((a) => (
                <div key={a.label} className="px-4 py-3">
                  <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--color-charcoal)]">
                    <Dot tone={a.state === 'ok' ? 'ok' : a.state === 'failed' ? 'bad' : 'quiet'} />
                    {a.name}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--color-charcoal-light)]">{a.what}</p>
                  <p className="mt-1 text-[12px] text-[var(--color-charcoal-light)]">
                    <span className="font-mono">{a.schedule}</span>
                    {a.state === 'failed' ? <span className="font-semibold text-[#9a2a1f]"> · last run failed</span> : null}
                    {a.state === 'off' ? ' · switched off' : ''}
                    {a.lastRun ? ` · ran ${dayTime(a.lastRun)}` : ''}
                  </p>
                </div>
              ))}
            </Card>
          ) : (
            <Empty>The bot has not reported its schedule yet.</Empty>
          )}
        </div>
      ) : null}

      <SnoozeSheet key={`snooze-${snoozing?.id ?? 'none'}`} task={snoozing} onClose={() => setSnoozing(null)} />
      <AddTaskSheet key={addingTask ? 'task-open' : 'task-closed'} open={addingTask} onClose={() => setAddingTask(false)} />
      <AddDutySheet key={addingDuty ? 'duty-open' : 'duty-closed'} open={addingDuty} onClose={() => setAddingDuty(false)} />
    </div>
  )
}
