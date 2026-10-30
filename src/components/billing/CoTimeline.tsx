// A change order's timeline (lib/billing/coTimeline.ts): asked, priced, sent,
// opened, approved, billed, each with when. Newest last, the way it happened.

import { timelineWhen, type TimelineLine } from '@/lib/billing/coTimeline'

const DOT: Record<TimelineLine['tone'], string> = {
  plain: 'bg-[var(--color-stone-mid)]',
  good: 'bg-[var(--color-teal)]',
  warn: 'bg-[#b8860b]',
}

export default function CoTimeline({ lines, className = '' }: { lines: TimelineLine[]; className?: string }) {
  if (!lines.length) return <p className={`text-xs text-[var(--color-charcoal-light)] ${className}`}>Nothing recorded yet.</p>
  return (
    <ol className={`space-y-1.5 ${className}`} data-testid="co-timeline">
      {lines.map((l, i) => (
        <li key={`${l.at}-${i}`} className="flex gap-2.5 text-sm">
          <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[l.tone]}`} />
          <span className="min-w-0">
            <span className={l.tone === 'warn' ? 'text-[#8f6c18]' : 'text-[var(--color-charcoal)]'}>{l.text}</span>
            <span className="ml-1.5 whitespace-nowrap text-xs text-[var(--color-charcoal-light)]">{timelineWhen(l.at)}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
