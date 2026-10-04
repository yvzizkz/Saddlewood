'use client'

import { useState } from 'react'

import { Button, Card, Chip, Empty, ScreenTitle, SectionTitle, Segmented } from '@/components/bot/ui'
import { addDays, clock12, dayLabel, hoursText, weekDays, weekStart, workedMinutes } from '@/lib/crew/time'
import type { CrewShift } from '@/lib/crew/types'
import { useCrew } from './CrewProvider'
import { FixTimeSheet } from './CrewSheets'
import { entryLine, entryStatus } from './TodayScreen'

// A crew member's own timesheet: this week and last, shift by shift, and the
// way to ask the office to correct it. They cannot change a time themselves.

export default function HoursScreen() {
  const { home, error, t, lang } = useCrew()
  const [which, setWhich] = useState<'this' | 'last'>('this')
  const [fix, setFix] = useState<{ shift: CrewShift | null } | null>(null)
  const [sheetKey, setSheetKey] = useState(0)

  if (!home) {
    return (
      <div className="px-4 pt-6">
        <ScreenTitle title={t.hoursTitle} />
        <Empty>{error ?? t.loading}</Empty>
      </div>
    )
  }

  const start = which === 'this' ? weekStart(home.day) : addDays(weekStart(home.day), -7)
  const days = weekDays(start)
  const inWeek = home.shifts.filter((s) => s.day >= days[0] && s.day <= days[6])
  const total = inWeek.reduce((sum, s) => sum + workedMinutes(s), 0)
  const fixes = home.entries.filter((e) => e.kind === 'timefix')

  function openFix(shift: CrewShift | null) {
    setSheetKey((k) => k + 1)
    setFix({ shift })
  }

  return (
    <div className="px-4 pb-8 pt-6">
      <ScreenTitle title={t.hoursTitle} />
      <Segmented
        label={t.hoursTitle}
        value={which}
        onChange={setWhich}
        options={[
          { value: 'this', label: t.thisWeek },
          { value: 'last', label: t.lastWeek },
        ]}
      />

      <Card className="mt-4 flex items-baseline justify-between px-4 py-3.5">
        <span className="text-[13px] text-[var(--color-charcoal-light)]">{t.total}</span>
        <span className="text-2xl text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          {hoursText(total)}
        </span>
      </Card>

      {inWeek.length ? (
        <div className="mt-3 space-y-3">
          {days
            .filter((d) => inWeek.some((s) => s.day === d))
            .map((d) => {
              const shifts = inWeek.filter((s) => s.day === d)
              return (
                <Card key={d} className="divide-y divide-[var(--color-stone)]">
                  <div className="flex items-baseline justify-between px-4 py-2.5">
                    <span className="text-[13px] font-medium text-[var(--color-charcoal)]">{dayLabel(d, home.day, lang)}</span>
                    <span className="font-mono text-[13px] text-[var(--color-charcoal)]">{hoursText(shifts.reduce((sum, s) => sum + workedMinutes(s), 0))}</span>
                  </div>
                  {shifts.map((s) => (
                    <button key={s.id} type="button" onClick={() => openFix(s)} className="block w-full px-4 py-3 text-left active:bg-[var(--color-cream)]">
                      <span className="block text-[15px] leading-snug text-[var(--color-charcoal)]">{s.jobName}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--color-charcoal-light)]">
                        {clock12(s.startedAt)} – {s.endedAt ? clock12(s.endedAt) : t.stillOn}
                        {s.endedAt && s.breakMin ? <span>· {t.breakOf(s.breakMin)}</span> : null}
                        {s.review ? <Chip tone="warn">{t.officeWillCheck}</Chip> : null}
                      </span>
                    </button>
                  ))}
                </Card>
              )
            })}
        </div>
      ) : (
        <div className="mt-3">
          <Empty>{t.noHours}</Empty>
        </div>
      )}

      <p className="mt-4 text-[12px] leading-relaxed text-[var(--color-charcoal-light)]">{t.hoursNote}</p>
      <Button full className="mt-3" onClick={() => openFix(null)}>
        {t.wrong}
      </Button>

      {fixes.length ? (
        <>
          <SectionTitle>{t.fixRequests}</SectionTitle>
          <Card className="divide-y divide-[var(--color-stone)]">
            {fixes.map((e) => {
              const line = entryLine(e, t, lang)
              const status = entryStatus(e, t)
              return (
                <div key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[15px] leading-snug text-[var(--color-charcoal)]">{line.title}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--color-charcoal-light)]">{line.detail}</p>
                  </div>
                  <Chip tone={status.tone}>{status.label}</Chip>
                </div>
              )
            })}
          </Card>
        </>
      ) : null}

      {fix ? <FixTimeSheet key={sheetKey} shift={fix.shift} onClose={() => setFix(null)} /> : null}
    </div>
  )
}
