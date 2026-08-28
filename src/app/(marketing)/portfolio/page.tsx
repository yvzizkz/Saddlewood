import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FullBleedHero } from "@/components/FullBleedHero";
import { CTABanner } from "@/components/CTABanner";
import { SpecTable } from "@/components/SpecTable";
import { caseStudies, type CaseStudy } from "@/data/case-studies";
import { lineworkRegistry, NeighborhoodPlat } from "@/components/linework";

export const metadata = {
  title: "Portfolio | Remodeling & New Construction Case Studies in Scottsdale",
  description:
    "Case studies of luxury kitchen, bath, and whole-home remodeling in McCormick Ranch, Gainey Ranch, and Pinnacle Peak, plus a ground-up estate build in Paradise Valley, all by Saddlewood Contracting's in-house crews.",
  alternates: { canonical: "/portfolio" },
};

/** First two sentences of the study's narrative, verbatim from the data. */
function excerpt(study: CaseStudy): string {
  const opening = study.narrative[0] ?? "";
  const two = opening.split(". ").slice(0, 2).join(". ");
  return two.endsWith(".") ? two : `${two}.`;
}

export default function PortfolioPage() {
  return (
    <>
      <FullBleedHero
        media={{
          kind: "image",
          src: "/images/render-poolwide.jpg",
          alt: "Rendering of the rear of the estate in progress in Paradise Valley",
          kenBurns: true,
        }}
        label="Rendering of the estate in progress, Paradise Valley"
        mediaCaption="Rendering · Estate in progress, Paradise Valley"
        eyebrow="The Work"
        title={
          <>
            Case <em className="font-normal italic text-gold">Studies</em>
          </>
        }
        description="Luxury kitchen, bath, and whole-home remodels across McCormick Ranch, Gainey Ranch, and Pinnacle Peak, and a ground-up estate in Paradise Valley."
      />

      {/* ---- The ledger — six case studies as editorial rows on the cream
           interlude (premium-standard rhythm: media hero → cream cards →
           deep CTA). Off-white ground, teal drafting grid, accessible gold
           for small type, linework rendered as drafting ink. ---- */}
      <section
        className="night-on-cream relative border-b border-gold/[0.35] bg-off-white py-[clamp(72px,9vh,112px)] text-charcoal"
        aria-label="Case studies"
      >
        <div className="night-cream-grid" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <span className="section-label !mb-0">Selected Work</span>
          <p className="mt-6 max-w-[640px] text-[15.5px] leading-[1.8] text-charcoal-light">
            Every build here was carried by our own licensed crews across all
            four trades, general, electrical, plumbing, and HVAC, from
            demolition to the final fixture. Six case studies, told the way we
            plan them: drawn first, then built.
          </p>

          <div className="mt-[clamp(44px,6vh,72px)] border-t border-teal/[0.18]">
            {caseStudies.map((study, i) => {
              const Motif = lineworkRegistry[study.linework];
              return (
                <article
                  key={study.slug}
                  className="group border-b border-teal/[0.18]"
                >
                  <div className="grid gap-x-[clamp(40px,5vw,88px)] gap-y-9 py-[clamp(44px,7vh,84px)] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    {/* Plate: index numeral, drawn motif, spec preview */}
                    <div>
                      <div className="text-[10.5px] font-medium tracking-[0.25em] text-gold-accessible">
                        {String(i + 1).padStart(2, "0")}
                        <span className="text-charcoal/50"> / 06</span>
                      </div>
                      <div className="linework-ink mt-7" aria-hidden="true">
                        {study.linework === "plat" ? (
                          /* The plat defaults to 0.35 background opacity —
                             lift it so the motif reads at ledger scale. */
                          <NeighborhoodPlat
                            className="block h-[clamp(140px,15vw,190px)] w-full max-w-[400px]"
                            opacity={0.85}
                          />
                        ) : Motif ? (
                          <Motif className="block h-[clamp(140px,15vw,190px)] w-full max-w-[400px]" />
                        ) : null}
                      </div>
                      {/* SpecTable draws with the dark-ground tokens (gold
                          labels, off-white values and hairlines); remap them
                          to ink for the cream ground the same way
                          .linework-ink remaps --gold. */}
                      <div className="linework-ink [--off-white:var(--charcoal)]">
                        <SpecTable
                          specs={study.specs.filter(
                            (spec) => spec.label !== "Category"
                          )}
                          className="mt-8 hidden max-w-[400px] lg:block"
                        />
                      </div>
                    </div>

                    {/* Entry: meta, title, narrative excerpt, scope line.
                        The title is "Community · Phase", so the meta line
                        carries only the category. */}
                    <div className="flex flex-col items-start">
                      <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-gold-accessible">
                        {study.category}
                      </div>
                      <h2 className="mt-5 font-heading text-[clamp(28px,3.4vw,44px)] font-medium leading-[1.15] tracking-[-0.02em]">
                        <Link
                          href={`/portfolio/${study.slug}`}
                          className="text-charcoal no-underline transition-colors duration-500 group-hover:text-gold-display"
                        >
                          {study.title}
                        </Link>
                      </h2>
                      <p className="mt-6 max-w-[560px] text-[15.5px] leading-[1.8] text-charcoal-light">
                        {excerpt(study)}
                      </p>
                      <p className="mt-6 max-w-[560px] text-[13px] leading-[1.7] text-charcoal-light">
                        {study.scope.slice(0, 4).join(" · ")}
                      </p>
                      <Link
                        href={`/portfolio/${study.slug}`}
                        className="mt-9 inline-flex items-center gap-2 border-b border-gold-accessible/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-accessible no-underline transition-colors hover:border-gold-accessible"
                      >
                        Read the case study
                        <ArrowRight
                          className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-1"
                          aria-hidden="true"
                        />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <CTABanner />
    </>
  );
}
