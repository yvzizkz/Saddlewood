'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Bell, BellOff, ChevronRight, Download, LogOut, Send, Share2, ShieldCheck } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { botApi, useBot } from './BotProvider'
import { Button, Card, Chip, Empty, INPUT, ScreenTitle, SectionTitle } from './ui'
import { ago } from '@/lib/bot/view'

// Everything that is not the day's work: put the app on the phone, turn on
// notifications, bring a teammate in, reach the rest of the portal, and the
// one switch that stops the bot from sending on its own.

const PORTAL: { href: string; label: string; note: string }[] = [
  { href: '/internal/ops', label: 'Ops board', note: 'SOPs, roles, what is being built' },
  { href: '/internal/ops/calendar', label: 'Calendar', note: 'Rhythm, milestones, deadlines' },
  { href: '/internal/trackers', label: 'Progress trackers', note: 'Schedules of values and invoices' },
  { href: '/internal?tab=pending', label: 'Estimates', note: 'Bids waiting for sign-off' },
  { href: '/internal/expenses', label: 'Expenses', note: 'Tag Zelle payments and receipts' },
  { href: '/internal/contracts', label: 'Contracts', note: 'Agreements in review' },
  { href: '/internal/proposals', label: 'Proposals', note: 'Client presentations' },
  { href: '/internal/leads', label: 'Leads', note: 'Callbacks waiting' },
]

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function watchStandalone(onChange: () => void) {
  const mq = window.matchMedia('(display-mode: standalone)')
  mq.addEventListener('change', onChange)
  window.addEventListener('appinstalled', onChange)
  return () => {
    mq.removeEventListener('change', onChange)
    window.removeEventListener('appinstalled', onChange)
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; the touch points give it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

const never = () => () => {}

export function useInstall() {
  // On the server (and the first paint) assume it is already installed, so
  // the install card never flashes at someone who has the app.
  const standalone = useSyncExternalStore(watchStandalone, isStandalone, () => true)
  const ios = useSyncExternalStore(never, isIos, () => false)
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])
  return { standalone, ios, prompt, clearPrompt: () => setPrompt(null) }
}

function InstallCard() {
  const { standalone, ios, prompt, clearPrompt } = useInstall()
  if (standalone) return null
  return (
    <>
      <SectionTitle>Put it on your phone</SectionTitle>
      <Card className="p-4">
        <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--color-charcoal)]">
          <Download className="size-4" aria-hidden="true" /> Add Saddlewood to your home screen
        </p>
        {prompt ? (
          <>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-charcoal-light)]">
              It opens full screen like any other app, and it can notify you.
            </p>
            <Button
              variant="primary"
              full
              className="mt-3"
              onClick={async () => {
                await prompt.prompt()
                await prompt.userChoice.catch(() => null)
                clearPrompt()
              }}
            >
              Install
            </Button>
          </>
        ) : ios ? (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[var(--color-charcoal)]">
            <li>
              Open this page in <span className="font-semibold">Safari</span>.
            </li>
            <li>
              Tap the <span className="font-semibold">Share</span> button (the square with the arrow).
            </li>
            <li>
              Tap <span className="font-semibold">Add to Home Screen</span>, then <span className="font-semibold">Add</span>.
            </li>
            <li>Open Saddlewood from your home screen and sign in there once.</li>
          </ol>
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[var(--color-charcoal)]">
            <li>
              Open this page in <span className="font-semibold">Chrome</span>.
            </li>
            <li>
              Tap the <span className="font-semibold">⋮</span> menu, then <span className="font-semibold">Install app</span>{' '}
              (or <span className="font-semibold">Add to Home screen</span>).
            </li>
          </ol>
        )}
      </Card>
    </>
  )
}

function NotificationsCard() {
  const { home, toast } = useBot()
  const { standalone, ios } = useInstall()
  const [state, setState] = useState<'unknown' | 'unsupported' | 'off' | 'on' | 'blocked'>('unknown')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function read() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setState('blocked')
        return
      }
      const reg = await navigator.serviceWorker.getRegistration('/app')
      const sub = await reg?.pushManager.getSubscription()
      if (!cancelled) setState(sub ? 'on' : 'off')
    }
    read().catch(() => setState('unsupported'))
    return () => {
      cancelled = true
    }
  }, [])

  if (!home?.push.available || !home.push.publicKey) return null
  const publicKey = home.push.publicKey

  async function turnOn() {
    setWorking(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
      await botApi('/api/bot/push', { method: 'POST', body: JSON.stringify(sub.toJSON()) })
      setState('on')
    } catch (e) {
      toast(`Notifications did not turn on: ${(e as Error).message}`, 'bad')
    } finally {
      setWorking(false)
    }
  }

  async function turnOff() {
    setWorking(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/app')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await botApi('/api/bot/push', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
      setState('off')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <SectionTitle>Notifications</SectionTitle>
      <Card className="p-4">
        {state === 'on' ? (
          <>
            <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--color-charcoal)]">
              <Bell className="size-4" aria-hidden="true" /> On for this phone
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-charcoal-light)]">
              You hear when a draft needs your OK, when an answer is ready, and when the bot goes down.
            </p>
            <Button className="mt-3" busy={working} onClick={turnOff}>
              <BellOff className="size-4" aria-hidden="true" /> Turn off
            </Button>
          </>
        ) : state === 'blocked' ? (
          <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">
            Notifications are blocked for Saddlewood in this phone&apos;s settings. Allow them there, then come back.
          </p>
        ) : state === 'unsupported' ? (
          <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">
            {ios && !standalone
              ? 'On an iPhone, notifications work once Saddlewood is on your home screen. Add it, open it from there, and this switch appears.'
              : 'This browser cannot show notifications.'}
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">
              Get a notification when a draft needs your OK, when an answer is ready, and when the bot goes down.
            </p>
            <Button variant="primary" full className="mt-3" busy={working || state === 'unknown'} onClick={turnOn}>
              <Bell className="size-4" aria-hidden="true" /> Turn on notifications
            </Button>
          </>
        )}
      </Card>
    </>
  )
}

function InviteCard() {
  const { home, toast } = useBot()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  if (!home) return null
  const link = typeof window === 'undefined' ? '/app' : `${window.location.origin}/app`

  async function share() {
    const data = { title: 'Saddlewood app', text: 'The Saddlewood app. Sign in with your work email.', url: link }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(link)
        toast('Link copied.', 'ok')
      }
    } catch {
      // closed the share sheet
    }
  }

  async function invite() {
    setSending(true)
    try {
      await botApi('/api/ops/invite', {
        method: 'POST',
        body: JSON.stringify({
          email,
          next: '/app',
          send: true,
          subject: 'The Saddlewood app is ready on your phone',
          message: {
            eyebrow: 'Saddlewood app',
            headline: 'Open the Saddlewood app on your phone',
            paragraphs: [
              'This is how you reach SaddleWoodBot from your phone: ask it for things, approve what it drafts, and see what it is working on.',
              'Tap the button on your phone. It signs you in.',
            ],
            buttonLabel: 'Open the app',
            afterButton: [
              'Then put it on your home screen. iPhone: tap Share, then Add to Home Screen. Android: tap Install.',
              'The first time you open it from the home screen it asks you to sign in once more. Enter this email address and it sends you a code.',
            ],
          },
        }),
      })
      toast(`Sign-in link sent to ${email}.`, 'ok')
      setEmail('')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <SectionTitle>Bring someone in</SectionTitle>
      <Card className="p-4">
        <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">
          The app is for Saddlewood staff only. A person needs a seat (Lando adds it) before the link lets them in.
        </p>
        <Button full className="mt-3" onClick={share}>
          <Share2 className="size-4" aria-hidden="true" /> Share the app link
        </Button>
        {home.me.role === 'owner' && home.team.length ? (
          <div className="mt-4 border-t border-[var(--color-stone)] pt-4">
            <label className="block text-xs font-medium text-[var(--color-charcoal)] mb-1.5" htmlFor="invite-email">
              Or email a one-tap sign-in link (good for 24 hours)
            </label>
            <div className="flex gap-2">
              <select id="invite-email" className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)}>
                <option value="">Choose a person</option>
                {home.team.map((t) => (
                  <option key={t.email} value={t.email}>
                    {t.name} ({t.email})
                  </option>
                ))}
              </select>
              <Button variant="primary" busy={sending} disabled={!email} onClick={invite} aria-label="Send the sign-in link">
                <Send className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </>
  )
}

export default function MoreScreen() {
  const { home, error, act, busy } = useBot()
  const [armed, setArmed] = useState(false)
  const [leaving, setLeaving] = useState(false)

  async function signOut() {
    setLeaving(true)
    try {
      // This phone only. The default would sign the person out everywhere.
      await createClient().auth.signOut({ scope: 'local' })
    } finally {
      window.location.href = '/login?next=/app'
    }
  }

  if (!home) {
    return (
      <div className="px-4 pt-6">
        <ScreenTitle title="More" />
        {error ? <Empty>Could not load: {error}</Empty> : <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-cream)]" aria-hidden="true" />}
      </div>
    )
  }

  const owner = home.me.role === 'owner'
  const { health, fixes } = home.sections
  const openFixes = fixes.filter((f) => ['open', 'building', 'built'].includes(f.status))

  return (
    <div className="px-4 pt-6 pb-8">
      <ScreenTitle title="More" />

      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[16px] font-medium text-[var(--color-charcoal)]">{home.me.name ?? 'No seat yet'}</p>
          <p className="truncate text-[13px] text-[var(--color-charcoal-light)]">{home.me.email}</p>
        </div>
        <Chip tone={owner ? 'ink' : 'quiet'}>{owner ? 'Owner' : home.me.role === 'requester' ? 'Can ask' : 'Not set up'}</Chip>
      </Card>

      <InstallCard />
      <NotificationsCard />
      <InviteCard />

      {owner ? (
        <>
          <SectionTitle>Sending rules</SectionTitle>
          <Card className="p-4">
            <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--color-charcoal)]">
              <ShieldCheck className="size-4" aria-hidden="true" />
              {health.autosend.on ? 'The bot may send routine mail on its own' : 'Nothing leaves without a yes'}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-charcoal-light)]">
              {health.autosend.on
                ? 'Automatic sending is on for routine, low-risk drafts. Anything with money, legal or a new recipient still waits for you.'
                : `Automatic sending is off${health.autosend.note ? ` (${health.autosend.note})` : ''}. Every email to someone outside the company waits for an approval.`}
            </p>
            {health.autosend.on ? (
              <Button
                variant="danger"
                full
                className="mt-3"
                busy={!!busy.autosend}
                disabled={!home.bridge.online}
                onClick={async () => {
                  if (!armed) {
                    setArmed(true)
                    window.setTimeout(() => setArmed(false), 7000)
                    return
                  }
                  setArmed(false)
                  await act({ kind: 'autosend.off', payload: {} }, 'autosend')
                }}
              >
                {armed ? 'Yes, stop automatic sending now' : 'Stop automatic sending'}
              </Button>
            ) : null}
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-charcoal-light)]">
              Never from a phone: anything on the office hold list (settlement and legal threads), and anything with
              wire or bank details.
            </p>
          </Card>

          <SectionTitle count={openFixes.length}>The bot asked for these fixes</SectionTitle>
          {openFixes.length ? (
            <Card className="divide-y divide-[var(--color-stone)]">
              {openFixes.map((f) => (
                <div key={f.id} className="px-4 py-3">
                  <p className="flex items-center gap-2 text-[13px]">
                    <span className="font-mono font-medium text-[var(--color-charcoal)]">{f.id}</span>
                    <Chip tone={f.status === 'built' ? 'ok' : f.status === 'building' ? 'warn' : 'quiet'}>{f.status}</Chip>
                    {f.times > 1 ? <span className="text-[var(--color-charcoal-light)]">hit {f.times} times</span> : null}
                  </p>
                  <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-charcoal)]">{f.what}</p>
                </div>
              ))}
            </Card>
          ) : (
            <Empty>No open fix requests. When the bot hits something it cannot do, it files one here for Lando.</Empty>
          )}
        </>
      ) : null}

      {owner ? (
        <>
          <SectionTitle>The rest of the portal</SectionTitle>
          <Card className="divide-y divide-[var(--color-stone)]">
            {PORTAL.map((p) => (
              <Link key={p.href} href={p.href} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-[var(--color-cream)]">
                <span>
                  <span className="block text-[15px] text-[var(--color-charcoal)]">{p.label}</span>
                  <span className="block text-[12px] text-[var(--color-charcoal-light)]">{p.note}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-[var(--color-charcoal-light)]" aria-hidden="true" />
              </Link>
            ))}
          </Card>
        </>
      ) : null}

      <Button full className="mt-7" busy={leaving} onClick={signOut}>
        <LogOut className="size-4" aria-hidden="true" /> Sign out
      </Button>
      <p className="mt-4 text-center text-[11px] text-[var(--color-charcoal-light)]">
        {home.bridge.reportedAt ? `Bot last reported ${ago(home.bridge.reportedAt)}` : 'The bot has not reported yet'}
      </p>
    </div>
  )
}
