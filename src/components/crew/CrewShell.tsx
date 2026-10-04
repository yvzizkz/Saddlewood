'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { CalendarDays, Clock, Home, Menu, type LucideIcon } from 'lucide-react'

import { Dot } from '@/components/bot/ui'
import { clock12 } from '@/lib/crew/time'
import type { CrewLang } from '@/lib/crew/types'
import { CrewProvider, useCrew } from './CrewProvider'
import type { CrewStrings } from './strings'

// The frame a crew member's screens sit in: a slim header that says whether
// they are on the clock, and four thumb tabs.

type Tab = { href: string; label: (t: CrewStrings) => string; icon: LucideIcon }

const TABS: Tab[] = [
  { href: '/app', label: (t) => t.tabToday, icon: Home },
  { href: '/app/week', label: (t) => t.tabWeek, icon: CalendarDays },
  { href: '/app/hours', label: (t) => t.tabHours, icon: Clock },
  { href: '/app/more', label: (t) => t.tabMore, icon: Menu },
]

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const check = () => setOpen(window.innerHeight - vv.height > 140)
    vv.addEventListener('resize', check)
    return () => vv.removeEventListener('resize', check)
  }, [])
  return open
}

function ClockPill() {
  const { home, error, t, queue } = useCrew()
  if (!home) return <span className="text-xs text-[var(--color-charcoal-light)]">{error ? t.noConnection : t.loading}</span>
  const on = !!home.shift
  return (
    <Link
      href="/app"
      className="inline-flex max-w-[60%] items-center gap-1.5 rounded-full border border-[var(--color-stone)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--color-charcoal)]"
    >
      <Dot tone={queue.length ? 'warn' : on ? 'ok' : 'quiet'} />
      <span className="truncate">{on && home.shift ? `${t.onClock} · ${clock12(home.shift.startedAt)}` : t.offClock}</span>
    </Link>
  )
}

function TabBar() {
  const pathname = usePathname()
  const { home, t } = useCrew()
  const keyboardOpen = useKeyboardOpen()
  const badge = home?.questions.length ?? 0
  if (keyboardOpen) return null
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-stone)] bg-[var(--color-background)] pb-safe">
      <div className="mx-auto flex max-w-xl">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = tab.href === '/app' ? pathname === '/app' : pathname.startsWith(tab.href)
          const showBadge = tab.href === '/app' && badge > 0
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className="relative flex h-14 flex-1 flex-col items-center justify-center gap-1"
              style={{ color: active ? 'var(--color-teal)' : 'var(--color-charcoal-light)' }}
            >
              {active ? <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--color-gold)]" /> : null}
              <span className="relative">
                <Icon className="size-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                {showBadge ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-gold-accessible)] px-1 text-[10px] font-bold text-white"
                  >
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className="text-[11px] font-medium leading-none">{tab.label(t)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default function CrewShell({ children, lang, email }: { children: ReactNode; lang: CrewLang; email: string }) {
  const router = useRouter()

  // The service worker only exists for notifications (public/app-sw.js).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/app-sw.js', { scope: '/app' }).catch(() => {})
    const onMessage = (e: MessageEvent) => {
      const url = e.data && e.data.type === 'bot-open' ? e.data.url : null
      if (typeof url === 'string' && (url === '/app' || url.startsWith('/app/') || url.startsWith('/app?'))) router.push(url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  return (
    <CrewProvider initialLang={lang} email={email}>
      {/* ph-no-capture: the site's analytics must not record what is on these
          screens (hours, receipts, notes) or the text of what is tapped. */}
      <div className="bot-app ph-no-capture min-h-dvh">
        <header className="sticky top-0 z-30 border-b border-[var(--color-stone)] bg-[var(--color-background)]/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur">
          <div className="mx-auto flex h-[52px] max-w-xl items-center justify-between gap-3 px-4">
            <Link href="/app" className="flex shrink-0 items-center gap-2.5">
              <Image src="/images/logo-roundel.png" alt="" width={30} height={30} className="rounded-full" />
              <span className="text-lg text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
                Saddlewood
              </span>
            </Link>
            <ClockPill />
          </div>
        </header>
        <main className="mx-auto max-w-xl pb-[calc(56px+env(safe-area-inset-bottom,0px))]">{children}</main>
        <TabBar />
      </div>
    </CrewProvider>
  )
}
