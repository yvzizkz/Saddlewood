'use client'

import { ArrowRightLeft, Briefcase, CircleCheck, Eye, FileText, HardHat, Mail, MailCheck, MapPin, MessageSquare, PenLine, Phone, Send, StickyNote, Sparkle, type LucideIcon } from 'lucide-react'

import { Card, Empty } from '@/components/bot/ui'
import type { SalesEvent, SalesEventKind } from '@/lib/sales/types'
import { personName, stamp } from '../format'
import { eventText } from './labels'

// The opportunity's history, newest first. The database never lets a line be
// edited or removed (sales_events is append-only), so this is the record.

const ICON: Record<SalesEventKind, LucideIcon> = {
  created: Sparkle,
  stage: ArrowRightLeft,
  note: StickyNote,
  call: Phone,
  text: MessageSquare,
  email: Mail,
  visit: MapPin,
  estimate: FileText,
  issued: Send,
  viewed: Eye,
  accepted: CircleCheck,
  signed: PenLine,
  emailed: MailCheck,
  job: Briefcase,
  field: HardHat,
}

function who(actor: string): string {
  if (actor === 'client link') return 'Client'
  if (actor.startsWith('client: ')) return actor.slice(8)
  return personName(actor)
}

export function Timeline({ events }: { events: SalesEvent[] }) {
  if (events.length === 0) return <Empty>Nothing logged yet.</Empty>
  return (
    <Card className="px-4 py-2">
      <ol>
        {events.map((e, i) => {
          const Icon = ICON[e.kind] ?? StickyNote
          const big = e.kind === 'accepted' || e.kind === 'signed'
          return (
            <li key={e.id} className="relative flex gap-3 py-2.5">
              {/* The thread down the left joins one line to the next. */}
              {i < events.length - 1 ? <span aria-hidden="true" className="absolute left-[15px] top-10 bottom-0 w-px bg-[var(--color-stone)]" /> : null}
              <span
                aria-hidden="true"
                className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ${
                  big ? 'bg-[#2f6b4a] text-white' : 'bg-[var(--color-cream)] text-[var(--color-gold-accessible)]'
                }`}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className={`whitespace-pre-line text-[14px] leading-snug ${big ? 'font-semibold text-[#2f6b4a]' : 'text-[var(--color-charcoal)]'}`}>{eventText(e) || e.kind}</p>
                <p className="mt-0.5 text-[11px] text-[var(--color-charcoal-light)]">
                  {who(e.actor)} · {stamp(e.at)}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
