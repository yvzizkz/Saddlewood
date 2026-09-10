'use client'

import { H2 } from './format'

type Props = {
  mode: 'auto' | 'custom'
  text: string
  auto: string
  onMode: (mode: 'auto' | 'custom') => void
  onText: (text: string) => void
}

/** The NOTES block of the workbook: composed from the numbers, or written by hand. */
export function NotesSection({ mode, text, auto, onMode, onText }: Props) {
  const pretty = auto.replace(/ {2}\(/g, '\n(')
  return (
    <section aria-labelledby="notes-heading" className="rounded-lg border bg-white" style={{ borderColor: 'var(--color-stone)' }}>
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div>
          <h2 id="notes-heading" className={H2} style={{ fontFamily: 'var(--font-fraunces)' }}>
            Notes
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-charcoal-light)' }}>
            Composed from the numbers above. Switch to your own wording if you need to.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm shrink-0 min-h-[44px] px-1" style={{ color: 'var(--color-charcoal)' }}>
          <input type="checkbox" checked={mode === 'custom'} onChange={(e) => onMode(e.target.checked ? 'custom' : 'auto')} className="size-5 accent-[var(--color-gold-accessible)]" />
          Write my own
        </label>
      </div>
      <div className="px-4 pb-4">
        {mode === 'custom' ? (
          <textarea
            aria-label="Notes text"
            maxLength={8000}
            className="w-full min-h-[220px] rounded-lg border px-3 py-2 text-base md:text-sm leading-relaxed outline-none focus:border-[var(--color-teal)]"
            style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}
            value={text}
            onChange={(e) => onText(e.target.value.slice(0, 8000))}
          />
        ) : (
          <pre className="whitespace-pre-wrap text-xs leading-relaxed rounded-lg px-3 py-3 max-h-[260px] overflow-auto font-sans" style={{ backgroundColor: 'var(--color-cream)', color: 'var(--color-charcoal-light)' }}>
            {pretty}
          </pre>
        )}
      </div>
    </section>
  )
}
