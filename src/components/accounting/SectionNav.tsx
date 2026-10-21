'use client'

// The Accounting sections as one row: scrolls sideways on a phone, sits under
// the title on a desktop (where the sidebar also lists them). Keeps the period
// when you switch sections, so "this month" stays this month.

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { ACCOUNTING_SECTIONS } from '@/components/layout/nav'

export default function SectionNav() {
  const pathname = usePathname()
  const search = useSearchParams()
  const keep = new URLSearchParams()
  for (const k of ['p', 'from', 'to']) {
    const v = search.get(k)
    if (v) keep.set(k, v)
  }
  const q = keep.toString()
  // On a phone the row scrolls: bring the current section into view.
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [pathname])
  return (
    <nav ref={nav} aria-label="Accounting sections" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex w-max gap-1 rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)] p-1">
        {ACCOUNTING_SECTIONS.map((s) => {
          const on = s.href === '/app/accounting' ? pathname === s.href : pathname === s.href || pathname.startsWith(s.href + '/')
          return (
            <li key={s.href}>
              <Link
                href={q ? `${s.href}?${q}` : s.href}
                aria-current={on ? 'page' : undefined}
                className={`block whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  on ? 'bg-white text-[var(--color-charcoal)] shadow-sm' : 'text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]'
                }`}
              >
                {s.short}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
