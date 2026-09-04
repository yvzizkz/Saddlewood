'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/internal/ops', label: 'Board' },
  { href: '/internal/ops#ops-docs-heading', label: 'Documents', match: '/internal/ops/docs' },
  { href: '/internal/ops/calendar', label: 'Calendar' },
]

export default function OpsSubnav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Ops sections" className="flex gap-1 mb-5 -mx-1 overflow-x-auto">
      {TABS.map((t) => {
        const base = t.match ?? t.href.split('#')[0]
        const active = t.match ? pathname.startsWith(t.match) : pathname === base
        return (
          <Link
            key={t.label}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className="text-sm px-3 py-1.5 rounded-full whitespace-nowrap"
            style={{
              backgroundColor: active ? 'var(--color-teal)' : 'transparent',
              color: active ? 'white' : 'var(--color-charcoal)',
              border: `1px solid ${active ? 'var(--color-teal)' : 'var(--color-stone)'}`,
            }}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
