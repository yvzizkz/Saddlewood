import Link from 'next/link'
import { ChevronRight, X } from 'lucide-react'

// Where you are in a drill-down: Accounting › Payroll › Framing › 8009 Powell.
// Each step is a link back to that level; the narrowing chips below undo one
// filter at a time, in any order.

export type Crumb = { label: string; href: string }
export type FilterChip = { dimLabel: string; label: string; clearHref: string }

export default function Breadcrumbs({ crumbs, filters = [] }: { crumbs: Crumb[]; filters?: FilterChip[] }) {
  return (
    <div className="space-y-2">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-[13px]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1
            return (
              <li key={`${c.href}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight className="size-3.5 text-[#a39c92]" aria-hidden="true" /> : null}
                {last ? (
                  <span aria-current="page" className="font-medium text-[var(--color-charcoal)]">
                    {c.label}
                  </span>
                ) : (
                  <Link href={c.href} scroll={false} className="text-[var(--color-charcoal-light)] underline-offset-2 hover:text-[var(--color-charcoal)] hover:underline">
                    {c.label}
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      {filters.length ? (
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <Link
              key={f.clearHref}
              href={f.clearHref}
              scroll={false}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--color-stone-mid)] bg-white pl-3 pr-2 text-xs text-[var(--color-charcoal)] hover:bg-[var(--color-cream)]"
              aria-label={`Remove ${f.dimLabel}: ${f.label}`}
            >
              <span className="text-[var(--color-charcoal-light)]">{f.dimLabel}</span>
              <span className="font-medium">{f.label}</span>
              <X className="size-3.5 text-[var(--color-charcoal-light)]" aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
