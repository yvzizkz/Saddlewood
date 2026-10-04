'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Download, LogOut } from 'lucide-react'

import { keyBytes, useInstall } from '@/components/bot/MoreScreen'
import { Button, Card, Empty, ScreenTitle, SectionTitle, Segmented } from '@/components/bot/ui'
import { createClient } from '@/lib/supabase/client'
import { crewApi, useCrew } from './CrewProvider'

// The crew's settings: language, getting the app onto the home screen,
// notifications, signing out.

function InstallCard() {
  const { t } = useCrew()
  const { standalone, ios, prompt, clearPrompt } = useInstall()
  if (standalone) return null
  return (
    <>
      <SectionTitle>{t.install}</SectionTitle>
      <Card className="p-4">
        {prompt ? (
          <Button
            variant="primary"
            full
            onClick={async () => {
              await prompt.prompt()
              await prompt.userChoice.catch(() => null)
              clearPrompt()
            }}
          >
            <Download className="size-4" aria-hidden="true" /> {t.installNow}
          </Button>
        ) : (
          <p className="text-[15px] leading-relaxed text-[var(--color-charcoal)]">{ios ? t.installIos : t.installAndroid}</p>
        )}
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-charcoal-light)]">{t.installThen}</p>
      </Card>
    </>
  )
}

function NotificationsCard() {
  const { home, t, toast } = useCrew()
  const { standalone, ios } = useInstall()
  const [state, setState] = useState<'unknown' | 'unsupported' | 'off' | 'on' | 'blocked'>('unknown')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function read(): Promise<'unsupported' | 'blocked' | 'on' | 'off'> {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
      if (Notification.permission === 'denied') return 'blocked'
      const reg = await navigator.serviceWorker.getRegistration('/app')
      const sub = await reg?.pushManager.getSubscription()
      return sub ? 'on' : 'off'
    }
    read()
      .catch(() => 'unsupported' as const)
      .then((next) => {
        if (!cancelled) setState(next)
      })
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
      await crewApi('/api/crew/push', { method: 'POST', body: JSON.stringify(sub.toJSON()) })
      setState('on')
    } catch (e) {
      toast((e as Error).message, 'bad')
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
        await crewApi('/api/crew/push', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) })
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
      <SectionTitle>{t.notifications}</SectionTitle>
      <Card className="p-4">
        {state === 'on' ? (
          <>
            <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--color-charcoal)]">
              <Bell className="size-4" aria-hidden="true" /> {t.notifyOn}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-charcoal-light)]">{t.notifyWhat}</p>
            <Button className="mt-3" busy={working} onClick={turnOff}>
              <BellOff className="size-4" aria-hidden="true" /> {t.turnOff}
            </Button>
          </>
        ) : state === 'blocked' ? (
          <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">{t.notifyBlocked}</p>
        ) : state === 'unsupported' ? (
          <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">{ios && !standalone ? t.notifyIosFirst : t.notifyUnsupported}</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">{t.notifyWhat}</p>
            <Button variant="primary" full className="mt-3" busy={working || state === 'unknown'} onClick={turnOn}>
              <Bell className="size-4" aria-hidden="true" /> {t.turnOn}
            </Button>
          </>
        )}
      </Card>
    </>
  )
}

export default function CrewMoreScreen() {
  const { home, error, t, lang, setLang } = useCrew()
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

  return (
    <div className="px-4 pb-8 pt-6">
      <ScreenTitle title={t.tabMore} />

      <SectionTitle>{t.language}</SectionTitle>
      <Segmented
        label={t.language}
        value={lang}
        onChange={setLang}
        options={[
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Español' },
        ]}
      />

      <InstallCard />
      <NotificationsCard />

      <SectionTitle>{t.signedInAs}</SectionTitle>
      {home ? (
        <Card className="p-4">
          <p className="text-[15px] font-medium text-[var(--color-charcoal)]">{home.me.name}</p>
          <p className="text-[13px] text-[var(--color-charcoal-light)]">{home.me.email}</p>
          <Button className="mt-3" busy={leaving} onClick={signOut}>
            <LogOut className="size-4" aria-hidden="true" /> {t.signOut}
          </Button>
        </Card>
      ) : (
        <Empty>{error ?? t.loading}</Empty>
      )}
    </div>
  )
}
