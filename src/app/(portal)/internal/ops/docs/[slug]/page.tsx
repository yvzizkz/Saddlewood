import Link from 'next/link'
import { notFound } from 'next/navigation'

import { OpsMarkdown } from '@/components/ops/OpsMarkdown'
import { OPS_DOCS, getOpsDoc } from '@/content/ops/docs.generated'
import { listCards } from '@/lib/ops/queries'

export const dynamic = 'force-dynamic'

function statusTone(status: string): { label: string; bg: string; fg: string } {
  const s = status.toUpperCase()
  if (s.startsWith('APPROVED')) return { label: 'Approved', bg: 'rgba(47,107,74,0.14)', fg: '#2f6b4a' }
  if (s.startsWith('DRAFT')) return { label: 'Draft', bg: 'rgba(212,175,55,0.18)', fg: '#8f6c18' }
  return { label: 'Working copy', bg: 'rgba(24,40,40,0.10)', fg: '#182828' }
}

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return OPS_DOCS.map((d) => ({ slug: d.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const doc = getOpsDoc(slug)
  return { title: doc ? `${doc.title} · Saddlewood Portal` : 'Saddlewood Portal' }
}

export default async function OpsDocPage({ params }: Props) {
  const { slug } = await params
  const doc = getOpsDoc(slug)
  if (!doc) notFound()

  const idx = OPS_DOCS.findIndex((d) => d.slug === slug)
  const prev = idx > 0 ? OPS_DOCS[idx - 1] : null
  const next = idx < OPS_DOCS.length - 1 ? OPS_DOCS[idx + 1] : null
  const tone = statusTone(doc.status)

  // The board card that owns this document, if any: proposals go there.
  let ownerCard: { id: string; title: string } | null = null
  try {
    const cards = await listCards()
    const mine = cards.filter((c) => c.docSlug === slug)
    const pick = mine.find((c) => c.id === slug) ?? mine[0]
    if (pick) ownerCard = { id: pick.id, title: pick.title }
  } catch {
    ownerCard = null
  }

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-10 max-w-3xl mx-auto">
      <nav className="text-xs mb-6 flex flex-wrap gap-x-2" style={{ color: 'var(--color-charcoal-light)' }} aria-label="Breadcrumb">
        <Link href="/internal/ops" className="underline">Ops</Link>
        <span aria-hidden="true">/</span>
        <span>{doc.group}</span>
        <span aria-hidden="true">/</span>
        <span style={{ color: 'var(--color-charcoal)' }}>{doc.title}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-2 mb-5 text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
        <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.08em]" style={{ backgroundColor: tone.bg, color: tone.fg }}>
          {tone.label}
        </span>
        {doc.status && <span>{doc.status}</span>}
        {doc.updated && <span>· updated {doc.updated}</span>}
      </div>

      <article className="ops-doc">
        <OpsMarkdown>{doc.body}</OpsMarkdown>
      </article>

      <div className="mt-8 rounded border bg-white px-4 py-3 text-sm" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}>
        <div className="text-[10px] tracking-[0.12em] uppercase mb-1" style={{ color: 'var(--color-gold-accessible)' }}>
          This is a living document
        </div>
        <p className="leading-relaxed" style={{ color: 'var(--color-charcoal-light)' }}>
          To propose a change, {ownerCard ? (
            <>
              leave a response on its card,{' '}
              <Link href="/internal/ops" className="underline" style={{ color: 'var(--color-teal)' }}>
                {ownerCard.id}
              </Link>
              , or
            </>
          ) : 'reply to'}{' '}
          <a href="mailto:ops@saddlewoodcontracting.com" className="underline" style={{ color: 'var(--color-teal)' }}>
            ops@saddlewoodcontracting.com
          </a>
          . Name the rule, what it should say instead, and the incident or number behind it. Changes are decided
          at the Friday review; anything touching money, contracts, or people needs Marco&apos;s approval and a
          line in the operating model&apos;s changelog.
        </p>
      </div>

      <p className="mt-8 text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
        Source: <code>{doc.source}</code> in the Saddlewood-KB repo. Edit it there; this copy is regenerated.
      </p>

      <nav className="mt-6 mb-10 flex justify-between text-sm" aria-label="Document navigation">
        {prev ? (
          <Link href={`/internal/ops/docs/${prev.slug}`} className="underline" style={{ color: 'var(--color-teal)' }}>
            ← {prev.title}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/internal/ops/docs/${next.slug}`} className="underline text-right" style={{ color: 'var(--color-teal)' }}>
            {next.title} →
          </Link>
        ) : <span />}
      </nav>
    </div>
  )
}
