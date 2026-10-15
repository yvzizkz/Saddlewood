'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  FolderKanban,
  HardHat,
  Inbox,
  PlusSquare,
  Receipt,
  ScanFace,
  Share,
  Wallet,
   type LucideIcon,
} from 'lucide-react'

import { useInstall } from '@/components/bot/MoreScreen'
import { Button, Card, Chip } from '@/components/bot/ui'
import {
  declinePasskeyOffer,
  deviceLabel,
  enrollPasskey,
  FACE_ID_OFFER_ENABLED,
  passkeyOnThisDevice,
  passkeySupported,
  shouldOfferPasskey,
} from '@/lib/auth/passkeyClient'
import { firstNameOf, type CrewLang } from '@/lib/crew/types'

export type OnboardingRole = 'owner' | 'pm' | 'supervisor' | 'crew'
export type OnboardingStep = 'install' | 'faceid' | 'role'

export const ONBOARDED_KEY_PREFIX = 'sw_onboarded:'
export const ONBOARD_REPLAY_EVENT = 'sw:onboard-replay'

export function onboardedStorageKey(email: string): string {
  return `${ONBOARDED_KEY_PREFIX}${email.trim().toLowerCase()}`
}

export function hasCompletedOnboarding(email: string): boolean {
  if (!email) return true
  try {
    return localStorage.getItem(onboardedStorageKey(email)) === '1'
  } catch {
    return false
  }
}

export function markOnboardingComplete(email: string): void {
  if (!email) return
  try {
    localStorage.setItem(onboardedStorageKey(email), '1')
  } catch {
    // private mode
  }
}

export function triggerOnboardingReplay(email: string): void {
  if (!email) return
  try {
    localStorage.removeItem(onboardedStorageKey(email))
  } catch {
    // private mode
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ONBOARD_REPLAY_EVENT))
  }
}

export function resolveOnboardingRole(
  input: { kind: 'owner' } | { kind: 'crew'; group: string; perms: readonly string[] },
): OnboardingRole {
  if (input.kind === 'owner') return 'owner'
  const g = input.group.trim().toLowerCase()
  if (g === 'pm' || (input.perms.includes('projects.view') && input.perms.includes('money.view'))) {
    return 'pm'
  }
  if (g === 'lead' || g === 'supervisor' || input.perms.includes('crew.view')) {
    return 'supervisor'
  }
  return 'crew'
}

export function stepsForOnboarding(opts: {
  standalone: boolean
  offerFaceId: boolean
}): OnboardingStep[] {
  const steps: OnboardingStep[] = []
  if (!opts.standalone) steps.push('install')
  if (opts.offerFaceId) steps.push('faceid')
  steps.push('role')
  return steps
}

type RoleItem = {
  icon: LucideIcon
  title: string
  body: string
}

type RoleCopy = {
  badge: string
  headline: (first: string) => string
  lead: string
  items: RoleItem[]
}

const ROLE_COPY: Record<CrewLang, Record<OnboardingRole, RoleCopy>> = {
  en: {
    owner: {
      badge: 'Owner',
      headline: (first) => (first ? `Welcome, ${first}` : 'Welcome to Saddlewood'),
      lead: 'Everything that waits on an owner lives in one place on your phone.',
      items: [
        {
          icon: Inbox,
          title: 'Home — Waiting on you',
          body: 'Approve or hold draft emails, change orders, and questions from the field. Nothing goes out without your OK.',
        },
        {
          icon: Wallet,
          title: 'Money',
          body: 'See every open invoice and pay app across clients — billed, paid, owed, past due, and whether the client viewed it.',
        },
        {
          icon: HardHat,
          title: 'Crew & Projects',
          body: 'See who is on the clock right now, each job’s client promise date, field photos, and the supervisor’s nightly plan.',
        },
      ],
    },
    pm: {
      badge: 'Project Manager',
      headline: (first) => (first ? `Here’s your app, ${first}` : 'Here’s your app'),
      lead: 'You see the jobs you are assigned to, from field progress to job billing.',
      items: [
        {
          icon: FolderKanban,
          title: 'Crew → Projects & Money',
          body: 'Open Projects inside the Crew tab for each assigned job’s status, client promise, plans, and read-only contract, billed, paid, and owed totals.',
        },
        {
          icon: ClipboardCheck,
          title: 'Crew → Today & Schedule',
          body: 'See who is on the clock on your jobs, check finished tasks with photos, and set the schedule by priority.',
        },
        {
          icon: Clock,
          title: 'Today — Your own day',
          body: 'Clock in, send paper receipts or jobsite notes, and close out the day.',
        },
      ],
    },
    supervisor: {
      badge: 'Field Supervisor',
      headline: (first) => (first ? `Here’s your app, ${first}` : 'Here’s your app'),
      lead: 'Everything you need to run the field and line up tomorrow from your phone.',
      items: [
        {
          icon: HardHat,
          title: 'Crew → Today & Tasks',
          body: 'See who is on the clock, assign tasks in priority order, and verify finished work with photos.',
        },
        {
          icon: ClipboardCheck,
          title: 'Crew → Schedule, Runner & Plan',
          body: 'Set tomorrow’s schedule, stage material pickups for the runner, and send the nightly plan to the owners.',
        },
        {
          icon: Clock,
          title: 'Today & Hours',
          body: 'Clock in, send receipts and progress photos, and file the end-of-day report.',
        },
      ],
    },
    crew: {
      badge: 'Saddlewood Crew',
      headline: (first) => (first ? `Here’s your app, ${first}` : 'Here’s your app'),
      lead: 'Everything for your workday in one place.',
      items: [
        {
          icon: Clock,
          title: 'Today — Clock in & Job',
          body: 'Tap Clock in when you arrive, see today’s job with a Directions button, and check your tasks.',
        },
        {
          icon: Receipt,
          title: 'Send to the office',
          body: 'Send photos of paper receipts, wall progress before cover-up, and your end-of-day check-in.',
        },
        {
          icon: CheckCircle2,
          title: 'Week & Hours',
          body: 'Check your schedule for the next seven days and review your recorded hours anytime.',
        },
      ],
    },
  },
  es: {
    owner: {
      badge: 'Dueño',
      headline: (first) => (first ? `Bienvenido, ${first}` : 'Bienvenido a Saddlewood'),
      lead: 'Todo lo que espera tu decisión está en un solo lugar en tu teléfono.',
      items: [
        {
          icon: Inbox,
          title: 'Inicio — Esperando por ti',
          body: 'Aprueba o detén borradores de correo, órdenes de cambio y preguntas del campo. Nada sale sin tu visto bueno.',
        },
        {
          icon: Wallet,
          title: 'Dinero',
          body: 'Ve cada factura abierta por cliente: facturado, pagado, pendiente, vencido y si el cliente ya la vio.',
        },
        {
          icon: HardHat,
          title: 'Equipo y Proyectos',
          body: 'Ve quién está en turno ahora mismo, la fecha prometida de cada obra, fotos de avance y el plan nocturno.',
        },
      ],
    },
    pm: {
      badge: 'Gerente de proyecto',
      headline: (first) => (first ? `Aquí está tu app, ${first}` : 'Aquí está tu app'),
      lead: 'Ves los trabajos asignados a ti, desde el avance en obra hasta la facturación.',
      items: [
        {
          icon: FolderKanban,
          title: 'Equipo → Proyectos y Dinero',
          body: 'Abre Proyectos dentro de Equipo para ver el estado de tus obras, fecha prometida, planos y totales de contrato, facturado, pagado y pendiente.',
        },
        {
          icon: ClipboardCheck,
          title: 'Equipo → Hoy y Horario',
          body: 'Ve quién está en turno en tus obras, revisa tareas terminadas con fotos y organiza el horario por prioridad.',
        },
        {
          icon: Clock,
          title: 'Hoy — Tu propio día',
          body: 'Marca tu entrada, manda recibos en papel o notas de obra y cierra el día.',
        },
      ],
    },
    supervisor: {
      badge: 'Supervisor de campo',
      headline: (first) => (first ? `Aquí está tu app, ${first}` : 'Aquí está tu app'),
      lead: 'Todo para dirigir el campo y preparar el día de mañana desde tu teléfono.',
      items: [
        {
          icon: HardHat,
          title: 'Equipo → Hoy y Tareas',
          body: 'Ve quién está en turno, asigna tareas por orden de prioridad y verifica el trabajo terminado con fotos.',
        },
        {
          icon: ClipboardCheck,
          title: 'Equipo → Horario, Material y Plan',
          body: 'Pon el horario de mañana, prepara material para recoger y manda el plan nocturno a los dueños.',
        },
        {
          icon: Clock,
          title: 'Hoy y Horas',
          body: 'Marca tu entrada, manda recibos y fotos de avance, y llena el reporte de fin del día.',
        },
      ],
    },
    crew: {
      badge: 'Equipo Saddlewood',
      headline: (first) => (first ? `Aquí está tu app, ${first}` : 'Aquí está tu app'),
      lead: 'Todo para tu día de trabajo en un solo lugar.',
      items: [
        {
          icon: Clock,
          title: 'Hoy — Entrada y Trabajo',
          body: 'Toca Marcar entrada al llegar, ve tu trabajo de hoy con el botón de Cómo llegar y revisa tus tareas.',
        },
        {
          icon: Receipt,
          title: 'Mandar a la oficina',
          body: 'Manda fotos de recibos en papel, avance de paredes antes de tapar y tu cierre de fin del día.',
        },
        {
          icon: CheckCircle2,
          title: 'Semana y Horas',
          body: 'Revisa tu horario de los próximos siete días y tus horas registradas cuando quieras.',
        },
      ],
    },
  },
}

const STEP_COPY = {
  en: {
    stepOf: (cur: number, total: number) => `Step ${cur} of ${total}`,
    installBadge: 'Home Screen',
    installTitle: 'Put Saddlewood on your Home Screen',
    installLead: 'Open it like a regular app on your phone — full screen, one tap, with notifications.',
    installIos1: 'Tap Share at the bottom of Safari (the square with the arrow pointing up).',
    installIos2: 'Scroll down and tap "Add to Home Screen", then tap "Add".',
    installIos3: 'Open Saddlewood from your Home Screen icon.',
    installAndroid1: 'Tap the browser menu (three dots), then tap "Install app" or "Add to Home screen".',
    installAndroid2: 'Open Saddlewood from your Home Screen icon.',
    installPromptBtn: 'Add to Home Screen',
    continueBtn: 'Continue',
    faceIdBadge: 'Quick sign-in',
    faceIdTitle: 'Sign in with Face ID next time',
    faceIdLead: 'Use your face or fingerprint next time instead of waiting for an emailed code.',
    faceIdBtn: 'Turn on Face ID',
    faceIdBusy: 'Setting up…',
    faceIdSkip: 'Not now',
    faceIdFailed: 'Face ID did not turn on',
    openBtn: 'Open Saddlewood',
  },
  es: {
    stepOf: (cur: number, total: number) => `Paso ${cur} de ${total}`,
    installBadge: 'Pantalla de inicio',
    installTitle: 'Pon Saddlewood en tu pantalla de inicio',
    installLead: 'Ábrela como cualquier otra app en tu teléfono: pantalla completa, con un toque y con avisos.',
    installIos1: 'Toca Compartir abajo en Safari (el cuadro con la flecha hacia arriba).',
    installIos2: 'Baja y toca "Agregar a inicio", y luego toca "Agregar".',
    installIos3: 'Abre Saddlewood desde el icono en tu pantalla de inicio.',
    installAndroid1: 'Abre el menú del navegador (tres puntos) y toca "Instalar app" o "Agregar a pantalla principal".',
    installAndroid2: 'Abre Saddlewood desde el icono en tu pantalla de inicio.',
    installPromptBtn: 'Agregar a inicio',
    continueBtn: 'Continuar',
    faceIdBadge: 'Entrada rápida',
    faceIdTitle: 'Entra con Face ID la próxima vez',
    faceIdLead: 'Usa tu cara o tu huella la próxima vez en vez de esperar un código por correo.',
    faceIdBtn: 'Activar Face ID',
    faceIdBusy: 'Configurando…',
    faceIdSkip: 'Ahora no',
    faceIdFailed: 'No se activó Face ID',
    openBtn: 'Abrir Saddlewood',
  },
} as const

export function OnboardingFlow({
  email,
  name,
  role,
  lang = 'en',
  onLangChange,
}: {
  email: string
  name: string
  role: OnboardingRole
  lang?: CrewLang
  onLangChange?: (next: CrewLang) => void
}) {
  const { ios, prompt, clearPrompt } = useInstall()
  const [open, setOpen] = useState(false)
  const [steps, setSteps] = useState<OnboardingStep[]>(['role'])
  const [index, setIndex] = useState(0)
  const [enrolling, setEnrolling] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!email) return
    function evaluate(force = false) {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      const forcedByUrl = params?.get('onboard') === '1'
      if (!force && !forcedByUrl && hasCompletedOnboarding(email)) {
        setOpen(false)
        return
      }
      const isStandalone =
        typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true)
      const offerFaceId =
        FACE_ID_OFFER_ENABLED &&
        passkeySupported() &&
        !passkeyOnThisDevice() &&
        (force || forcedByUrl || shouldOfferPasskey())
      const computed = stepsForOnboarding({ standalone: isStandalone, offerFaceId })
      setSteps(computed)
      setIndex(0)
      setError('')
      setOpen(true)
    }

    evaluate(false)
    const onReplay = () => evaluate(true)
    window.addEventListener(ONBOARD_REPLAY_EVENT, onReplay)
    return () => window.removeEventListener(ONBOARD_REPLAY_EVENT, onReplay)
  }, [email])

  if (!open || !email) return null

  const currentStep = steps[Math.min(index, steps.length - 1)] ?? 'role'
  const c = STEP_COPY[lang]
  const r = ROLE_COPY[lang][role]
  const first = firstNameOf(name)

  function advance() {
    setError('')
    if (index + 1 < steps.length) {
      setIndex(index + 1)
    } else {
      finish()
    }
  }

  function finish() {
    markOnboardingComplete(email)
    if (typeof window !== 'undefined' && window.location.search.includes('onboard=1')) {
      const url = new URL(window.location.href)
      url.searchParams.delete('onboard')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    }
    setOpen(false)
  }

  async function handleInstallAction() {
    if (prompt) {
      await prompt.prompt().catch(() => null)
      await prompt.userChoice.catch(() => null)
      clearPrompt()
    }
    advance()
  }

  async function handleFaceIdEnroll() {
    if (enrolling) return
    setEnrolling(true)
    setError('')
    try {
      await enrollPasskey(deviceLabel())
      advance()
    } catch (e) {
      const err = e as Error
      if (!/NotAllowedError|cancel|abort/i.test(`${err.name} ${err.message}`)) {
        setError(`${c.faceIdFailed}: ${err.message}`)
      }
    } finally {
      setEnrolling(false)
    }
  }

  function handleFaceIdSkip() {
    declinePasskeyOffer()
    advance()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Saddlewood"
      className="ph-no-capture fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-[var(--color-background)] px-4 pt-[calc(16px+env(safe-area-inset-top,0px))] pb-[calc(24px+env(safe-area-inset-bottom,0px))]"
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Image src="/images/logo-roundel.png" alt="" width={28} height={28} className="rounded-full" />
          <span className="text-base text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
            Saddlewood
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onLangChange ? (
            <div className="inline-flex rounded-lg border border-[var(--color-stone)] bg-white p-0.5" role="group" aria-label="Language / Idioma">
              {(['en', 'es'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onLangChange(l)}
                  aria-pressed={lang === l}
                  lang={l}
                  className="min-h-8 rounded-md px-2.5 text-xs font-medium transition-colors"
                  style={
                    lang === l
                      ? { backgroundColor: 'var(--color-teal)', color: 'white' }
                      : { color: 'var(--color-charcoal-light)' }
                  }
                >
                  {l === 'en' ? 'English' : 'Español'}
                </button>
              ))}
            </div>
          ) : null}
          {steps.length > 1 ? (
            <span className="text-xs font-medium text-[var(--color-charcoal-light)]">
              {c.stepOf(index + 1, steps.length)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mx-auto my-auto w-full max-w-md py-6">
        {currentStep === 'install' ? (
          <div>
            <Chip tone="ink">{c.installBadge}</Chip>
            <h1
              className="mt-3 text-2xl leading-tight text-[var(--color-charcoal)]"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              {c.installTitle}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-charcoal-light)]">{c.installLead}</p>

            <Card className="mt-5 divide-y divide-[var(--color-stone)] p-0">
              {ios || !prompt ? (
                <>
                  <div className="flex items-start gap-3.5 p-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm font-semibold text-[var(--color-teal)]">
                      1
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">{c.installIos1}</p>
                    </div>
                    <Share className="mt-0.5 size-5 shrink-0 text-[var(--color-teal)]" aria-hidden="true" />
                  </div>
                  <div className="flex items-start gap-3.5 p-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm font-semibold text-[var(--color-teal)]">
                      2
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">{c.installIos2}</p>
                    </div>
                    <PlusSquare className="mt-0.5 size-5 shrink-0 text-[var(--color-teal)]" aria-hidden="true" />
                  </div>
                  <div className="flex items-start gap-3.5 p-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm font-semibold text-[var(--color-teal)]">
                      3
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">{c.installIos3}</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3.5 p-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm font-semibold text-[var(--color-teal)]">
                      1
                    </span>
                    <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">{c.installAndroid1}</p>
                  </div>
                  <div className="flex items-start gap-3.5 p-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm font-semibold text-[var(--color-teal)]">
                      2
                    </span>
                    <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">{c.installAndroid2}</p>
                  </div>
                </>
              )}
            </Card>

            <div className="mt-6">
              <Button variant="primary" full onClick={handleInstallAction}>
                {prompt ? (
                  <>
                    <Download className="size-4" aria-hidden="true" /> {c.installPromptBtn}
                  </>
                ) : (
                  c.continueBtn
                )}
              </Button>
            </div>
          </div>
        ) : currentStep === 'faceid' ? (
          <div>
            <Chip tone="ink">{c.faceIdBadge}</Chip>
            <h1
              className="mt-3 text-2xl leading-tight text-[var(--color-charcoal)]"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              {c.faceIdTitle}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-charcoal-light)]">{c.faceIdLead}</p>

            <Card className="mt-5 flex items-center gap-4 p-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-cream)] text-[var(--color-teal)]">
                <ScanFace className="size-6" aria-hidden="true" />
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-charcoal)]">
                {lang === 'es'
                  ? 'Funciona en Safari y en la app de tu pantalla de inicio en este iPhone.'
                  : 'Works in Safari and from your Home Screen icon on this iPhone.'}
              </p>
            </Card>

            {error ? (
              <p role="alert" className="mt-3 text-sm text-[var(--color-error-text)]">
                {error}
              </p>
            ) : null}

            <div className="mt-6">
              <Button variant="primary" full busy={enrolling} onClick={handleFaceIdEnroll}>
                <ScanFace className="size-4" aria-hidden="true" /> {enrolling ? c.faceIdBusy : c.faceIdBtn}
              </Button>
              <button
                type="button"
                disabled={enrolling}
                onClick={handleFaceIdSkip}
                className="mt-3 block min-h-11 w-full cursor-pointer text-center text-sm text-[var(--color-charcoal-light)] hover:underline disabled:opacity-50"
              >
                {c.faceIdSkip}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <Chip tone="ink">{r.badge}</Chip>
            <h1
              className="mt-3 text-2xl leading-tight text-[var(--color-charcoal)]"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              {r.headline(first)}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-charcoal-light)]">{r.lead}</p>

            <Card className="mt-5 divide-y divide-[var(--color-stone)] p-0">
              {r.items.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.title} className="flex items-start gap-3.5 p-4">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-cream)] text-[var(--color-teal)]">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-[var(--color-charcoal)]">{item.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-[var(--color-charcoal-light)]">{item.body}</p>
                    </div>
                  </div>
                )
              })}
            </Card>

            <div className="mt-6">
              <Button variant="primary" full onClick={finish}>
                {c.openBtn}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-md justify-center gap-1.5">
        {steps.length > 1
          ? steps.map((s, idx) => (
              <span
                key={s}
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-all ${
                  idx === index ? 'w-6 bg-[var(--color-teal)]' : 'w-1.5 bg-[var(--color-stone)]'
                }`}
              />
            ))
          : null}
      </div>
    </div>
  )
}
