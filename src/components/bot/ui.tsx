'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

// The app's small parts. Same paper, ink and gold as the rest of the portal;
// sized for a thumb: nothing tappable is under 44px tall.

export const TONE = {
  ok: { fg: '#2f6b4a', bg: 'rgba(47,107,74,0.12)' },
  warn: { fg: '#8f6c18', bg: 'rgba(212,175,55,0.20)' },
  bad: { fg: '#9a2a1f', bg: 'rgba(154,42,31,0.10)' },
  ink: { fg: '#182828', bg: 'rgba(24,40,40,0.08)' },
  quiet: { fg: '#5a5a5a', bg: 'rgba(44,41,38,0.06)' },
} as const
export type Tone = keyof typeof TONE

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--color-stone)] bg-white ${className}`}>{children}</div>
  )
}

export function Chip({ tone = 'quiet', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap"
      style={{ color: TONE[tone].fg, backgroundColor: TONE[tone].bg }}
    >
      {children}
    </span>
  )
}

export function Dot({ tone }: { tone: Tone }) {
  return <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ backgroundColor: TONE[tone].fg }} />
}

export function SectionTitle({ children, count, action }: { children: ReactNode; count?: number; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-2 mt-7 first:mt-0">
      {/* Not an <h2>: globals.css forces every h2 to 1.875rem on phones. */}
      <p
        role="heading"
        aria-level={2}
        className="text-[11px] font-medium tracking-[0.16em] uppercase font-mono"
        style={{ color: 'var(--color-gold-accessible)' }}
      >
        {children}
        {typeof count === 'number' && count > 0 ? <span className="ml-2 text-[var(--color-charcoal)]">{count}</span> : null}
      </p>
      {action}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-[var(--color-stone-mid)] px-4 py-5 text-sm text-[var(--color-charcoal-light)]">
      {children}
    </p>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  busy?: boolean
  full?: boolean
}

export function Button({ variant = 'secondary', busy = false, full = false, className = '', children, disabled, ...rest }: ButtonProps) {
  const look =
    variant === 'primary'
      ? 'bg-[var(--color-teal)] text-white border-[var(--color-teal)] active:bg-[var(--color-teal-dark)]'
      : variant === 'danger'
        ? 'bg-white text-[#9a2a1f] border-[rgba(154,42,31,0.35)] active:bg-[rgba(154,42,31,0.06)]'
        : variant === 'quiet'
          ? 'bg-transparent text-[var(--color-charcoal)] border-transparent active:bg-[var(--color-cream)]'
          : 'bg-white text-[var(--color-charcoal)] border-[var(--color-stone-mid)] active:bg-[var(--color-cream)]'
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors disabled:opacity-50 ${full ? 'w-full' : ''} ${look} ${className}`}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--color-charcoal)] mb-1.5">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-[var(--color-charcoal-light)] mt-1">{hint}</span> : null}
    </label>
  )
}

// 16px text in every input: anything smaller makes iOS zoom the page on focus.
export const INPUT =
  'w-full rounded-xl border border-[var(--color-stone-mid)] bg-white px-3 py-2.5 text-base text-[var(--color-charcoal)] placeholder:text-[#9a938a] focus:outline-none focus:border-[var(--color-teal)]'

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; count?: number }[]
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-xl bg-[var(--color-cream)] p-1 border border-[var(--color-stone)]">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`flex-1 min-h-10 rounded-lg text-sm font-medium transition-colors ${
              active ? 'bg-white text-[var(--color-charcoal)] shadow-sm' : 'text-[var(--color-charcoal-light)]'
            }`}
          >
            {o.label}
            {o.count ? <span className="ml-1.5 font-mono text-[11px] opacity-70">{o.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function ScreenTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-5">
      {eyebrow ? (
        <p className="text-[11px] tracking-[0.16em] uppercase font-mono mb-1" style={{ color: 'var(--color-gold-accessible)' }}>
          {eyebrow}
        </p>
      ) : null}
      {/* Sized by `.bot-app h1` in globals.css, which outranks the site-wide phone rule. */}
      <h1 className="text-[var(--color-charcoal)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
        {title}
      </h1>
      {children}
    </header>
  )
}
