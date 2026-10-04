'use client'

import { useState } from 'react'
import { MapPin } from 'lucide-react'

import { Card, Chip, Empty, ScreenTitle, SectionTitle } from '@/components/bot/ui'
import { clockText, dayLabel } from '@/lib/crew/time'
import type { CrewScheduleItem, CrewTask } from '@/lib/crew/types'
import { useCrew } from './CrewProvider'
import { TaskSheet } from './CrewSheets'
import { mapsLink, TaskRow } from './TodayScreen'

// The days ahead: where this person is scheduled, and everything assigned to them.

export default function WeekScreen() {
  const { home, error, t, lang } = useCrew()
  const [task, setTask] = useState<CrewTask | null>(null)

  if (!home) {
    return (
      <div className="px-4 pt-6">
        <ScreenTitle title={t.schedule} />
        <Empty>{error ?? t.loading}</Empty>
      </div>
    )
  }

  const byDay = new Map<string, CrewScheduleItem[]>()
  for (const s of home.schedule) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s])
  const live = home.tasks.filter((x) => x.status === 'open' || x.status === 'blocked')
  const finished = home.tasks.filter((x) => x.status === 'done')

  return (
    <div className="px-4 pb-8 pt-6">
      <ScreenTitle title={t.schedule} />

      {byDay.size ? (
        <div className="space-y-3">
          {[...byDay.entries()].map(([day, items]) => (
            <Card key={day} className="px-4 py-3.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--color-gold-accessible)' }}>
                {dayLabel(day, home.day, lang)}
              </p>
              <div className="mt-1.5 space-y-3">
                {items.map((item) => {
                  const job = home.jobs.find((j) => j.id === item.jobId)
                  return (
                    <div key={item.id}>
                      <p className="text-[17px] leading-snug text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
                        {item.jobName}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--color-charcoal-light)]">
                        {item.startTime ? <span>{t.startAt(clockText(item.startTime))}</span> : null}
                        {item.ack === 'ok' ? <Chip tone="ok">{t.gotIt}</Chip> : null}
                        {item.ack === 'cant' ? <Chip tone="bad">{t.youSaidCant}</Chip> : null}
                      </p>
                      {item.note ? <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-charcoal)]">{item.note}</p> : null}
                      {job?.address ? (
                        <a
                          href={mapsLink(job.address)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-[var(--color-teal)] underline"
                        >
                          <MapPin className="size-4" aria-hidden="true" />
                          {job.address}
                        </a>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty>{t.nothingScheduled}</Empty>
      )}

      <SectionTitle count={live.length}>{t.tasks}</SectionTitle>
      {live.length || finished.length ? (
        <Card className="divide-y divide-[var(--color-stone)]">
          {[...live, ...finished].map((x) => (
            <TaskRow key={x.id} task={x} onOpen={() => setTask(x)} />
          ))}
        </Card>
      ) : (
        <Empty>{t.noTasks}</Empty>
      )}

      {task ? <TaskSheet key={task.id} task={task} onClose={() => setTask(null)} /> : null}
    </div>
  )
}
