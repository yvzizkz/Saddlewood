'use client'

// The old portal's own pages, reached from one strip while they wait to move
// into the app (docs/COHESIVE-APP-PLAN.md; batch-2 prototypes are on hold).

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const OLD = [
  { href: '/internal', label: 'Pipeline estimates' },
  { href: '/internal/trackers', label: 'Progress trackers' },
  { href: '/internal/proposals', label: 'Proposals (old)' },
  { href: '/internal/contracts', label: 'Contracts (old)' },
  { href: '/internal/expenses', label: 'Expenses (old)' },
]

export default function OldToolsNav() {
  const pathname = usePathname()
  if (pathname.startsWith('/internal/ops')) return null
  return (
    <div className="border-b border-[var(--color-stone)] bg-[var(--color-cream)]/60">
      <div className="flex gap-1 overflow-x-auto px-4 py-2 md:px-6">
        <span className="mr-2 shrink-0 self-center font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-gold-accessible)]">Old tools</span>
        {OLD.map((o) => {
          const on = o.href === '/internal' ? pathname === '/internal' || pathname.startsWith('/internal/estimates') : pathname.startsWith(o.href)
          return (
            <Link
              key={o.href}
              href={o.href}
              aria-current={on ? 'page' : undefined}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-[var(--color-teal)] text-white' : 'text-[var(--color-charcoal)] hover:bg-white'}`}
            >
              {o.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
