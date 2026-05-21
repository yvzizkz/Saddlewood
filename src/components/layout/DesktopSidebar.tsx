'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, List, BookOpen, Activity, Settings, type LucideIcon } from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

type DesktopSidebarProps = {
  pendingCount: number
}

export default function DesktopSidebar({ pendingCount }: DesktopSidebarProps) {
  const pathname = usePathname()

  const items: NavItem[] = [
    { href: '/internal?tab=pending', label: 'Pending', icon: Home },
    { href: '/internal?tab=all', label: 'All', icon: List },
    { href: '/internal/bid-log', label: 'Bid Log', icon: BookOpen },
    { href: '/internal/activity', label: 'Activity', icon: Activity },
  ]

  function isActive(href: string): boolean {
    const base = href.split('?')[0]
    if (base === '/internal') return pathname === '/internal'
    return pathname === base || pathname.startsWith(base + '/')
  }

  return (
    <aside
      aria-label="Primary"
      className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-[var(--color-background)] border-r border-[var(--color-stone)] py-6 px-4 z-40"
    >
      <div
        className="px-3 mb-6 text-xl font-[family-name:var(--font-fraunces)]"
        style={{ color: 'var(--color-charcoal)' }}
      >
        Saddlewood
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          const showCount = item.label === 'Pending' && pendingCount > 0
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={
                'flex items-center gap-3 py-2 px-3 rounded transition-colors ' +
                (active
                  ? 'bg-[var(--color-teal)] text-white'
                  : 'text-[var(--color-charcoal)] hover:bg-[var(--color-stone)]')
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="text-sm font-medium">
                {showCount ? `${item.label} (${pendingCount})` : item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      <button
        type="button"
        disabled
        aria-disabled="true"
        className="flex items-center gap-3 py-2 px-3 rounded text-sm font-medium opacity-50 cursor-not-allowed text-left bg-transparent border-0"
        style={{ color: 'var(--color-charcoal)' }}
      >
        <Settings className="size-5" aria-hidden="true" />
        Settings
      </button>
    </aside>
  )
}
