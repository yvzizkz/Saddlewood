import Link from 'next/link'

import OpsBoard from '@/components/ops/OpsBoard'
import { OPS_DOCS } from '@/content/ops/docs.generated'
import { listCards } from '@/lib/ops/queries'
import type { OpsCard } from '@/lib/ops/types'

// Auth is enforced by the (portal)/internal layout: only allowlisted emails
// reach this page. The board's first paint comes from the server so the page
// is never an empty shell; moves and adds go through /api/ops/cards.

export const dynamic = 'force-dynamic'

const GROUP_ORDER = ['Operating model', 'Roles', 'SOPs', 'Crew guides', 'Jobs']

export default async function OpsPage() {
  let cards: OpsCard[] = []
  let loadError: string | null = null
  try {
    cards = await listCards()
  } catch (e) {
    loadError = (e as Error).message
  }

  const groups = GROUP_ORDER.map((g) => ({
    name: g,
    docs: OPS_DOCS.filter((d) => d.group === g),
  })).filter((g) => g.docs.length > 0)

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-10 max-w-6xl mx-auto">
      <p
        className="text-[11px] tracking-[0.14em] uppercase mb-2"
        style={{ color: 'var(--color-gold-accessible)' }}
      >
        Operating model · v1 · September 2026
      </p>
      <h1
        style={{ fontFamily: 'var(--font-fraunces)' }}
        className="text-3xl md:text-4xl mb-3 text-[var(--color-charcoal)]"
      >
        How Saddlewood runs
      </h1>
      <p className="max-w-2xl text-[15px] leading-relaxed mb-8" style={{ color: 'var(--color-charcoal-light)' }}>
        Every decision either has an owner with a written rule, or it is logged as a Marco decision and
        counted. The documents below are the rules. The board is what still has to exist before anyone can
        step into a role. Moves save for everyone the moment you make them.
      </p>

      <section aria-labelledby="ops-board-heading" className="mb-12">
        <h2
          id="ops-board-heading"
          style={{ fontFamily: 'var(--font-fraunces)' }}
          className="text-2xl mb-3 text-[var(--color-charcoal)]"
        >
          Ops board
        </h2>
        {loadError ? (
          <p className="text-sm rounded border px-4 py-3" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}>
            The board could not load its cards. {loadError}
          </p>
        ) : (
          <OpsBoard initialCards={cards} />
        )}
      </section>

      <section aria-labelledby="ops-docs-heading">
        <h2
          id="ops-docs-heading"
          style={{ fontFamily: 'var(--font-fraunces)' }}
          className="text-2xl mb-4 text-[var(--color-charcoal)]"
        >
          Documents
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.name}>
              <h3 className="text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: 'var(--color-gold-accessible)', fontFamily: 'var(--font-sans)' }}>
                {g.name}
              </h3>
              <ul className="flex flex-col divide-y rounded border" style={{ borderColor: 'var(--color-stone)' }}>
                {g.docs.map((d) => (
                  <li key={d.slug} style={{ borderColor: 'var(--color-stone)' }}>
                    <Link
                      href={`/internal/ops/docs/${d.slug}`}
                      className="block px-3 py-2.5 text-sm hover:bg-[var(--color-cream)] transition-colors"
                      style={{ color: 'var(--color-charcoal)' }}
                    >
                      {d.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs" style={{ color: 'var(--color-charcoal-light)' }}>
          Documents are drafts for Marco&apos;s review unless marked approved. Legal terms in SOP-007 and SOP-008
          go to an Arizona construction attorney before use.
        </p>
      </section>
    </div>
  )
}
