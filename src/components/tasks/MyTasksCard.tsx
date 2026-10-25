'use client'

// Home's "Your tasks": the count of what is yours on Tasks (Mine), what is
// overdue, due today and moved up to you, and the oldest few that Home does
// not already list, each opening where it is acted on (/api/tasks/mine).
// Owners and project managers; anyone else gets nothing back and sees nothing.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'

import { Card, Chip, SectionTitle } from '@/components/bot/ui'
import { formatValue } from '@/lib/analytics/format'
import type { MineSummary } from '@/lib/tasks/mine'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export default function MyTasksCard() {
  const [mine, setMine] = useState<MineSummary | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/tasks/mine', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<MineSummary>) : null))
      .then((data) => {
        if (live && data) setMine(data)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (!mine || mine.count === 0) return null
  return (
    <section aria-label="Your tasks" className="mt-7">
      <SectionTitle
        count={mine.count}
        action={
          <Link href="/app/tasks" className="text-[13px] text-[var(--color-teal)] underline">
            See all
          </Link>
        }
      >
        Your tasks
      </SectionTitle>
      <Card className="divide-y divide-[var(--color-stone)] overflow-hidden">
        {mine.overdue || mine.dueToday || mine.movedUp ? (
          <div className="flex flex-wrap gap-1.5 px-4 py-3">
            {mine.overdue ? <Chip tone="bad">{mine.overdue} overdue</Chip> : null}
            {mine.dueToday ? <Chip tone="warn">{mine.dueToday} due today</Chip> : null}
            {mine.movedUp ? <Chip tone="warn">{mine.movedUp} moved up to you</Chip> : null}
          </div>
        ) : null}
        {mine.top.map((i) => (
          <Link key={i.id} href={i.href} className="flex items-start gap-3 px-4 py-3.5 active:bg-[var(--color-cream)]">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-snug text-[var(--color-charcoal)]">{i.title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-[var(--color-charcoal-light)]">
                {[
                  i.job,
                  i.overdueDays ? `${plural(i.overdueDays, 'day', 'days')} late` : i.dueOn ? `due ${formatValue('date', i.dueOn)}` : '',
                  i.escalated ? 'moved up to you' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <ChevronRight className="mt-1 size-4 shrink-0 text-[var(--color-charcoal-light)]" aria-hidden="true" />
          </Link>
        ))}
      </Card>
    </section>
  )
}
