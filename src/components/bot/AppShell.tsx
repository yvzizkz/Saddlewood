'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { MessageSquare } from 'lucide-react'

import { OnboardingFlow } from '@/components/auth/OnboardingFlow'
import { BotProvider, useBot } from './BotProvider'
import { Dot } from './ui'
import { healthLine, needsYouCount } from '@/lib/bot/view'
import AppSidebar from '@/components/layout/AppSidebar'
import { activeHref, phoneTabs, type NavViewer } from '@/components/layout/nav'

// The frame every app screen sits in: a slim header that says whether the bot
// is alive, and the thumb tabs. On a desktop it is the same column, centered.

// The tabs and the desktop rail are the one navigation (components/layout/nav.ts).
// Ask is a tool, not a place: it sits in the header.

/** Pages laid out for a desktop: tables and charts use the full width. */
const WIDE = ['/app/accounting', '/app/jobs', '/app/tasks', '/app/schedule', '/app/departments', '/app/changes']

function useNavViewer(): NavViewer {
  const { home } = useBot()
  const owner = home?.me.role === 'owner'
  // The Crew tab shows once the crew side exists for this owner (home.crew is null until its tables do).
  return { owner, crewAdmin: owner && !!home?.crew }
}

/** True while the on-screen keyboard is up, so the tab bar can step aside. */
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

function StatusPill() {
  const { home, error } = useBot()
  if (!home) {
    return <span className="text-xs text-[var(--color-charcoal-light)]">{error ? 'No connection' : 'Loading…'}</span>
  }
  const h = healthLine(home)
  return (
    <Link
      href="/app#health"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-stone)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--color-charcoal)]"
    >
      <Dot tone={h.tone} />
      <span>Bot {h.label.toLowerCase()}</span>
    </Link>
  )
}

function TabBar() {
  const pathname = usePathname()
  const { home } = useBot()
  const keyboardOpen = useKeyboardOpen()
  const badge = needsYouCount(home)
  const tabs = phoneTabs(useNavViewer())
  if (keyboardOpen) return null
  return (
    <nav
      aria-label="App"
      // z-30: under a sheet's backdrop (z-40), so an open sheet dims the tabs too.
      className="fixed bottom-0 inset-x-0 z-30 border-t border-[var(--color-stone)] bg-[var(--color-background)] pb-safe md:hidden"
    >
      <div className="mx-auto flex max-w-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = activeHref(pathname, tabs) === tab.href
          const count = tab.href === '/app' ? badge : tab.href === '/app/crew' ? (home?.crew?.needs ?? 0) : 0
          const showBadge = count > 0
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className="relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1"
              style={{ color: active ? 'var(--color-teal)' : 'var(--color-charcoal-light)' }}
            >
              {active ? <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--color-gold)]" /> : null}
              <span className="relative">
                <Icon className="size-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                {showBadge ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-[var(--color-gold-accessible)] text-white rounded-full flex items-center justify-center"
                    >
                      {count}
                    </span>
                    <span className="sr-only">{count} waiting on you</span>
                  </>
                ) : null}
              </span>
              <span className="whitespace-nowrap text-[11px] font-medium leading-none">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function OwnerOnboarding() {
  const { home } = useBot()
  if (!home?.me.email) return null
  return <OnboardingFlow email={home.me.email} name={home.me.name ?? ''} role="owner" />
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const viewer = useNavViewer()
  const { home } = useBot()
  const wide = WIDE.some((w) => pathname === w || pathname.startsWith(w + '/'))
  const col = wide ? 'max-w-7xl' : 'max-w-xl'
  return (
    <div className="bot-app ph-no-capture min-h-dvh">
      <OwnerOnboarding />
      <AppSidebar viewer={viewer} badges={{ '/app': needsYouCount(home) }} />
      <div className="md:pl-60">
        <header className="sticky top-0 z-30 border-b border-[var(--color-stone)] bg-[var(--color-background)]/95 backdrop-blur pt-[env(safe-area-inset-top,0px)]">
          {/* 52px + the 1px rule: AskScreen pins itself under exactly this. */}
          <div className={`mx-auto flex h-[52px] ${col} items-center justify-between gap-2 px-4`}>
            <Link href="/app" className="flex items-center gap-2.5 md:invisible">
              <Image src="/images/logo-roundel.png" alt="" width={30} height={30} className="rounded-full" />
              <span className="text-lg text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
                Saddlewood
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <StatusPill />
              <Link
                href="/app/ask"
                aria-label="Ask the bot"
                aria-current={pathname.startsWith('/app/ask') ? 'page' : undefined}
                className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--color-stone)] bg-white text-[var(--color-charcoal)] aria-[current=page]:bg-[var(--color-teal)] aria-[current=page]:text-white"
              >
                <MessageSquare className="size-[18px]" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </header>
        {/* AskScreen measures itself against this column; wide pages set their own padding. */}
        <main className={`mx-auto ${col} pb-[calc(56px+env(safe-area-inset-bottom,0px))] md:pb-8`}>{children}</main>
      </div>
      <TabBar />
    </div>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter()

  // The service worker only exists for notifications (see public/app-sw.js).
  // Tapping one while the app is open sends the screen to go to.
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
    <BotProvider>
      {/* ph-no-capture: the site's analytics must not record what is on these
          screens (draft emails, amounts, client names) or the text of what is
          tapped. Sheets render outside this div and carry the class themselves. */}
      <Frame>{children}</Frame>
    </BotProvider>
  )
}
