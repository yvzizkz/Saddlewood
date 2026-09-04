import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { OPS_DOCS, getOpsDoc } from '@/content/ops/docs.generated'

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

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-10 max-w-3xl mx-auto">
      <nav className="text-xs mb-6 flex flex-wrap gap-x-2" style={{ color: 'var(--color-charcoal-light)' }} aria-label="Breadcrumb">
        <Link href="/internal/ops" className="underline">Ops</Link>
        <span aria-hidden="true">/</span>
        <span>{doc.group}</span>
        <span aria-hidden="true">/</span>
        <span style={{ color: 'var(--color-charcoal)' }}>{doc.title}</span>
      </nav>

      <article className="ops-doc">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body}</ReactMarkdown>
      </article>

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
