import OpsCalendar from '@/components/ops/OpsCalendar'
import OpsSubnav from '@/components/ops/OpsSubnav'
import { OPS_DOCS } from '@/content/ops/docs.generated'
import { listGoals } from '@/lib/ops/goals'
import type { OpsGoal } from '@/lib/ops/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Calendar · Saddlewood Portal' }

function todayInPhoenix(): string {
  // Arizona has no daylight saving; the portal's day is Phoenix's day.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return parts
}

export default async function OpsCalendarPage() {
  let goals: OpsGoal[] = []
  let loadError: string | null = null
  try {
    goals = await listGoals()
  } catch (e) {
    loadError = (e as Error).message
  }
  const docTitles = Object.fromEntries(OPS_DOCS.map((d) => [d.slug, d.title]))

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-10 max-w-4xl mx-auto">
      <p className="text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: 'var(--color-gold-accessible)' }}>
        Operating model · goals and dates
      </p>
      <h1 style={{ fontFamily: 'var(--font-fraunces)' }} className="text-3xl md:text-4xl mb-3 text-[var(--color-charcoal)]">
        What we are working toward
      </h1>
      <p className="max-w-2xl text-[15px] leading-relaxed mb-5" style={{ color: 'var(--color-charcoal-light)' }}>
        The weekly rhythm, the first 30 days, the money and compliance dates that do not move, and the goals
        for the quarter, next year, and the exit. Check things off as they land. Anyone on the portal can add a
        date; the bot and sessions can too.
      </p>
      <OpsSubnav />
      {loadError ? (
        <p className="text-sm rounded border px-4 py-3" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}>
          The calendar could not load. {loadError}
        </p>
      ) : (
        <OpsCalendar initialGoals={goals} docTitles={docTitles} today={todayInPhoenix()} />
      )}
    </div>
  )
}
