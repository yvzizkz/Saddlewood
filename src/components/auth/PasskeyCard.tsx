'use client'

import { useEffect, useState } from 'react'
import { ScanFace, Trash2 } from 'lucide-react'

import { Button, Card, SectionTitle } from '@/components/bot/ui'
import {
  deviceLabel,
  enrollPasskey,
  forgetPasskeyOnThisDevice,
  passkeyOnThisDevice,
  passkeySupported,
  removePasskey,
} from '@/lib/auth/passkeyClient'

// Face ID / fingerprint for next time. Lives on both More screens (owners and
// crew). The person is signed in already; enrolling adds a passkey for this
// device, and the login page then leads with the Face ID button.

type Passkey = { id: string; label: string; createdAt: string; lastUsedAt: string | null }

const COPY = {
  en: {
    title: 'Face ID sign-in',
    on: 'On for this phone',
    onNote: 'Next time the app asks you to sign in, use your face or your finger instead of an emailed code.',
    offNote: 'Sign in next time with your face or your finger instead of waiting for an emailed code.',
    turnOn: 'Turn on Face ID',
    unsupported: 'This browser cannot do Face ID sign-in. On an iPhone it works in Safari and from the home screen.',
    devices: 'Devices with Face ID',
    remove: 'Remove',
    added: 'Added',
    used: 'last used',
    never: 'not used yet',
    failed: 'Face ID did not turn on',
  },
  es: {
    title: 'Entrar con Face ID',
    on: 'Activado en este teléfono',
    onNote: 'La próxima vez que la app pida entrar, usa tu cara o tu dedo en vez de un código por correo.',
    offNote: 'Entra la próxima vez con tu cara o tu dedo en vez de esperar un código por correo.',
    turnOn: 'Activar Face ID',
    unsupported: 'Este navegador no puede usar Face ID. En un iPhone funciona en Safari y desde la pantalla de inicio.',
    devices: 'Dispositivos con Face ID',
    remove: 'Quitar',
    added: 'Agregado',
    used: 'último uso',
    never: 'sin usar todavía',
    failed: 'No se activó Face ID',
  },
}

function day(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function PasskeyCard({ lang = 'en', toast }: { lang?: 'en' | 'es'; toast?: (msg: string, tone: 'ok' | 'bad') => void }) {
  const t = COPY[lang]
  const [state, setState] = useState<'unknown' | 'unsupported' | 'off' | 'on'>('unknown')
  const [list, setList] = useState<Passkey[]>([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const res = await fetch('/api/auth/passkey/register')
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; passkeys?: Passkey[] }
    if (body.ok && body.passkeys) setList(body.passkeys)
  }

  useEffect(() => {
    if (!passkeySupported()) {
      setState('unsupported')
      return
    }
    setState(passkeyOnThisDevice() ? 'on' : 'off')
    load().catch(() => null)
  }, [])

  async function turnOn() {
    setWorking(true)
    setError('')
    try {
      await enrollPasskey(deviceLabel())
      setState('on')
      await load().catch(() => null)
      toast?.(t.on, 'ok')
    } catch (e) {
      const err = e as Error
      if (!/NotAllowedError|cancel|abort/i.test(`${err.name} ${err.message}`)) {
        setError(`${t.failed}: ${err.message}`)
      }
    } finally {
      setWorking(false)
    }
  }

  async function remove(id: string) {
    setWorking(true)
    try {
      await removePasskey(id)
      const rest = list.filter((p) => p.id !== id)
      setList(rest)
      if (!rest.length) {
        forgetPasskeyOnThisDevice()
        setState('off')
      }
    } catch (e) {
      toast?.((e as Error).message, 'bad')
    } finally {
      setWorking(false)
    }
  }

  if (state === 'unknown') return null

  return (
    <>
      <SectionTitle>{t.title}</SectionTitle>
      <Card className="p-4">
        {state === 'unsupported' ? (
          <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">{t.unsupported}</p>
        ) : state === 'on' ? (
          <>
            <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--color-charcoal)]">
              <ScanFace className="size-4" aria-hidden="true" /> {t.on}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-charcoal-light)]">{t.onNote}</p>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">{t.offNote}</p>
            <Button variant="primary" full className="mt-3" busy={working} onClick={turnOn}>
              <ScanFace className="size-4" aria-hidden="true" /> {t.turnOn}
            </Button>
          </>
        )}
        {error ? <p className="mt-2 text-sm text-[var(--color-error-text)]">{error}</p> : null}
        {list.length ? (
          <ul className="mt-4 divide-y divide-[var(--color-stone)] border-t border-[var(--color-stone)]">
            {list.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-charcoal)]">{p.label || t.devices}</p>
                  <p className="text-xs text-[var(--color-charcoal-light)]">
                    {t.added} {day(p.createdAt)} · {p.lastUsedAt ? `${t.used} ${day(p.lastUsedAt)}` : t.never}
                  </p>
                </div>
                <Button variant="quiet" disabled={working} onClick={() => remove(p.id)} aria-label={`${t.remove} ${p.label}`}>
                  <Trash2 className="size-4" aria-hidden="true" /> {t.remove}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  )
}
