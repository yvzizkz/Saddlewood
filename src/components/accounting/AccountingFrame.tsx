import type { ReactNode } from 'react'

import Breadcrumbs, { type Crumb, type FilterChip } from '@/components/data/Breadcrumbs'
import PeriodPicker from '@/components/data/PeriodPicker'
import type { Period } from '@/lib/analytics/period'
import SectionNav from './SectionNav'

// Every Accounting page: the section row, the title, the period, where you
// are in the drill-down, then the page. Same on a phone and a desktop; the
// desktop simply has room for the charts side by side.

export default function AccountingFrame({
  title,
  intro,
  period,
  crumbs,
  filters,
  actions,
  sections,
  children,
}: {
  title: string
  intro?: string
  period?: Period
  crumbs?: Crumb[]
  filters?: FilterChip[]
  actions?: ReactNode
  /** The sections this seat may open (access.ts); every section when not given. */
  sections?: string[]
  children: ReactNode
}) {
  return (
    <div className="px-4 pb-10 pt-4 md:px-8 md:pt-6">
      <SectionNav only={sections} />
      <header className="mb-4 mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-gold-accessible)]">Accounting</p>
          {/* Sized by `.bot-app h1` in globals.css. */}
          <h1 className="text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
            {title}
          </h1>
          {intro ? <p className="mt-1 max-w-2xl text-sm text-[var(--color-charcoal-light)]">{intro}</p> : null}
        </div>
        {actions}
      </header>
      {period ? (
        <div className="mb-4">
          <PeriodPicker period={period} compareLabel={period.previous.label} />
        </div>
      ) : null}
      {crumbs && crumbs.length > 1 ? (
        <div className="mb-4">
          <Breadcrumbs crumbs={crumbs} filters={filters} />
        </div>
      ) : null}
      <div className="space-y-4">{children}</div>
    </div>
  )
}
