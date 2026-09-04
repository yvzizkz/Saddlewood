'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, List, BookOpen, Activity, ClipboardList, type LucideIcon } from 'lucide-react'

type Tab = {
  href: string
  label: string
  icon: LucideIcon
  /** Number to render as a small badge on top-right of the icon. Only shown when > 0. */
  badge?: number
}

type BottomTabBarProps = {
  pendingCount: number
}

export default function BottomTabBar({ pendingCount }: BottomTabBarProps) {
  const pathname = usePathname()

  const tabs: Tab[] = [
    { href: '/internal?tab=pending', label: 'Pending', icon: Home, badge: pendingCount },
    { href: '/internal?tab=all', label: 'All', icon: List },
    { href: '/internal/bid-log', label: 'Bid Log', icon: BookOpen },
    { href: '/internal/activity', label: 'Activity', icon: Activity },
    { href: '/internal/ops', label: 'Ops', icon: ClipboardList },
  ]

  function isActive(href: string): boolean {
    const base = href.split('?')[0]
    // For tabs that share the /internal route (pending + all), highlight both
    // when we're on /internal regardless of query.
    if (base === '/internal') return pathname === '/internal'
    return pathname === base || pathname.startsWith(base + '/')
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-[var(--color-background)] border-t border-[var(--color-stone)] pb-safe flex"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = isActive(tab.href)
        const showBadge = (tab.badge ?? 0) > 0
        return (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px]"
            style={{ color: active ? 'var(--color-teal)' : 'var(--color-charcoal)' }}
          >
            <span className="relative">
              <Icon className="size-6" aria-hidden="true" />
              {showBadge && (
                <>
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-2 size-4 text-[10px] font-bold bg-[var(--color-gold)] text-white rounded-full flex items-center justify-center"
                  >
                    {tab.badge}
                  </span>
                  <span className="sr-only">{tab.badge} pending</span>
                </>
              )}
            </span>
            <span className="text-[11px] font-medium">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
