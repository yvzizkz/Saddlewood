import Link from 'next/link'
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

import Breadcrumbs, { type Crumb, type FilterChip } from '@/components/data/Breadcrumbs'
import PeriodPicker from '@/components/data/PeriodPicker'
import type { Period } from '@/lib/analytics/period'

// A job's page: who and where, the lifecycle strip (sale → award → build →
// billing → closeout), the tabs, then the tab. Each tab is one of the app's
// sections narrowed to this job, so the job is the hub everything hangs off.

export type JobTab = { key: string; label: string; count?: number }
export type Stage = { key: string; label: string; state: 'done' | 'now' | 'next'; href?: string }

export default function JobFrame({
  title,
  sub,
  stages,
  tabs,
  tab,
  baseHref,
  period,
  crumbs,
  filters,
  actions,
  children,
}: {
  title: string
  sub: ReactNode
  stages: Stage[]
  tabs: JobTab[]
  tab: string
  baseHref: string
  period?: Period
  crumbs: Crumb[]
  filters?: FilterChip[]
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="px-4 pb-10 pt-4 md:px-8 md:pt-6">
      <Breadcrumbs crumbs={crumbs} />
      <header className="mb-4 mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-gold-accessible)]">Job</p>
          <h1 className="text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
            {title}
          </h1>
          <div className="mt-1 text-sm text-[var(--color-charcoal-light)]">{sub}</div>
        </div>
        {actions}
      </header>

      <ol aria-label="Lifecycle" className="mb-4 flex gap-1 overflow-x-auto">
        {stages.map((s) => {
          const look =
            s.state === 'done'
              ? 'bg-[rgba(47,107,74,0.10)] text-[#2f6b4a]'
              : s.state === 'now'
                ? 'bg-[var(--color-teal)] text-white'
                : 'bg-[var(--color-cream)] text-[var(--color-charcoal-light)]'
          const inner = (
            <span className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-medium ${look}`}>
              {s.state === 'done' ? <Check className="size-3.5" aria-hidden="true" /> : null}
              {s.label}
            </span>
          )
          return (
            <li key={s.key} aria-current={s.state === 'now' ? 'step' : undefined}>
              {s.href ? <Link href={s.href}>{inner}</Link> : inner}
            </li>
          )
        })}
      </ol>

      <nav aria-label="Job sections" className="-mx-4 mb-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex w-max gap-1 border-b border-[var(--color-stone)]">
          {tabs.map((t) => {
            const on = t.key === tab
            return (
              <li key={t.key}>
                <Link
                  href={t.key === 'overview' ? baseHref : `${baseHref}?tab=${t.key}`}
                  aria-current={on ? 'page' : undefined}
                  className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                    on ? 'border-[var(--color-teal)] text-[var(--color-charcoal)]' : 'border-transparent text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]'
                  }`}
                >
                  {t.label}
                  {t.count ? <span className="rounded-full bg-[var(--color-cream)] px-1.5 text-[11px] text-[var(--color-charcoal)]">{t.count}</span> : null}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {period ? (
        <div className="mb-4">
          <PeriodPicker period={period} compareLabel={period.previous.label} />
        </div>
      ) : null}
      {filters?.length ? (
        <div className="mb-4">
          <Breadcrumbs crumbs={[]} filters={filters} />
        </div>
      ) : null}
      <div className="space-y-4">{children}</div>
    </div>
  )
}
