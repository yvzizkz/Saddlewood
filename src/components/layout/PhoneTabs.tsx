'use client'

// The phone layout of the one navigation, for pages outside the app shell
// (the /internal portal). Same tabs, same order as inside the app.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { activeHref, phoneTabs, type NavViewer } from './nav'

export default function PhoneTabs({ viewer }: { viewer: NavViewer }) {
  const pathname = usePathname()
  const tabs = phoneTabs(viewer)
  const active = activeHref(pathname, tabs)
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-stone)] bg-[var(--color-background)] pb-safe md:hidden">
      <div className="mx-auto flex max-w-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const on = active === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={on ? 'page' : undefined}
              className="relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1"
              style={{ color: on ? 'var(--color-teal)' : 'var(--color-charcoal-light)' }}
            >
              {on ? <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--color-gold)]" /> : null}
              <Icon className="size-6" strokeWidth={on ? 2.2 : 1.8} aria-hidden="true" />
              <span className="whitespace-nowrap text-[11px] font-medium leading-none">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
