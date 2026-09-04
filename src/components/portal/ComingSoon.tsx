import type { ReactNode } from 'react'
import Link from 'next/link'

type Props = {
  eyebrow: string
  title: string
  intro: string
  /** What this page will hold, one line each. */
  items: string[]
  /** Where the same information lives in the meantime. */
  meanwhile?: ReactNode
}

// A page that is not built yet says so plainly, says what it will hold, and
// points at where the information lives today. Nothing here is a dead end.

export default function ComingSoon({ eyebrow, title, intro, items, meanwhile }: Props) {
  return (
    <div className="px-4 pt-6 md:px-8 md:pt-10 max-w-2xl mx-auto">
      <p className="text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: 'var(--color-gold-accessible)' }}>
        {eyebrow}
      </p>
      <h1 style={{ fontFamily: 'var(--font-fraunces)' }} className="text-3xl md:text-4xl mb-3 text-[var(--color-charcoal)]">
        {title}
      </h1>
      <p className="text-[15px] leading-relaxed mb-6" style={{ color: 'var(--color-charcoal-light)' }}>
        {intro}
      </p>
      <div className="rounded border bg-white p-5" style={{ borderColor: 'var(--color-stone)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(212,175,55,0.18)', color: '#8f6c18' }}>
            Coming soon
          </span>
          <span className="text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
            What this page will hold
          </span>
        </div>
        <ul className="flex flex-col gap-2 text-sm" style={{ color: 'var(--color-charcoal)' }}>
          {items.map((it) => (
            <li key={it} className="flex gap-2">
              <span aria-hidden="true" style={{ color: 'var(--color-gold-accessible)' }}>
                ·
              </span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </div>
      {meanwhile && (
        <div className="mt-5 text-sm leading-relaxed" style={{ color: 'var(--color-charcoal-light)' }}>
          {meanwhile}
        </div>
      )}
      <p className="mt-8 text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
        <Link href="/internal/ops" className="underline" style={{ color: 'var(--color-teal)' }}>
          Back to Ops
        </Link>
      </p>
    </div>
  )
}
