'use client'

// The desktop layout of the one navigation (nav.ts): a fixed left rail from
// md up, grouped Work · Money · Office. Accounting opens its sections inline
// while you are in it.

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { activeHref, visibleNav, type NavViewer } from './nav'

export default function AppSidebar({ viewer, badges = {} }: { viewer: NavViewer; badges?: Record<string, number> }) {
  const pathname = usePathname()
  const items = visibleNav(viewer)
  const active = activeHref(pathname, items)
  const groups = ['Work', 'Money', 'Office'] as const

  return (
    <aside
      aria-label="Sections"
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-[var(--color-stone)] bg-[var(--color-background)] md:flex"
    >
      <Link href="/app" className="flex h-[53px] shrink-0 items-center gap-2.5 border-b border-[var(--color-stone)] px-5">
        <Image src="/images/logo-roundel.png" alt="" width={28} height={28} className="rounded-full" />
        <span className="text-lg text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
          Saddlewood
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((g) => {
          const list = items.filter((i) => i.group === g && i.href !== '/app/more')
          if (!list.length) return null
          return (
            <div key={g} className="mb-5">
              <p className="mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-gold-accessible)]">{g}</p>
              <ul className="space-y-0.5">
                {list.map((i) => {
                  const on = active === i.href
                  const Icon = i.icon
                  const count = badges[i.href] ?? 0
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={on ? 'page' : undefined}
                        className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                          on ? 'bg-[var(--color-teal)] text-white' : 'text-[var(--color-charcoal)] hover:bg-[var(--color-cream)]'
                        }`}
                      >
                        <Icon className="size-[18px] shrink-0" strokeWidth={on ? 2.2 : 1.8} aria-hidden="true" />
                        <span className="flex-1">{i.label}</span>
                        {count > 0 ? (
                          <span className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold ${on ? 'bg-white/20 text-white' : 'bg-[var(--color-gold-accessible)] text-white'}`}>{count}</span>
                        ) : null}
                      </Link>
                      {on && i.children ? (
                        <ul className="mb-1 ml-[22px] mt-1 space-y-0.5 border-l border-[var(--color-stone-mid)] pl-3">
                          {i.children.map((c) => {
                            const sub = pathname === c.href || pathname.startsWith(c.href + '/')
                            return (
                              <li key={c.href}>
                                <Link
                                  href={c.href}
                                  aria-current={sub ? 'page' : undefined}
                                  className={`block rounded-md px-2 py-1.5 text-[13px] ${sub ? 'font-semibold text-[var(--color-charcoal)]' : 'text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]'}`}
                                >
                                  {c.label}
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
