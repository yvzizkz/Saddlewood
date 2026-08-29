import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { FullBleedHero } from "@/components/FullBleedHero";
import { CTABanner } from "@/components/CTABanner";
import { caseStudies, type CaseStudy } from "@/data/case-studies";

export const metadata = {
  title: "Portfolio | Remodeling & New Construction Case Studies in Scottsdale",
  description:
    "Case studies of luxury kitchen, bath, and whole-home remodeling in McCormick Ranch, Gainey Ranch, and Pinnacle Peak, plus a ground-up estate build in Paradise Valley, all by Saddlewood Contracting's in-house crews.",
  alternates: { canonical: "/portfolio" },
};

/**
 * Portfolio index, reconfigured 2026-08-28 (owner note: the page "seems weak
 * and redundant, we either reconfigure or retire it").
 *
 * The redundancy was structural: three of the six studies are the same
 * Paradise Valley estate, presented as three peers in one long ledger of
 * identical rows. They are now one feature carried by the real footage from
 * that job, with the three studies as its chapters, and the three Scottsdale
 * remodels sit below as a compact index. Every slug still resolves, so the
 * legacy redirects keep landing on a real page.
 */

/** First two sentences of the study's narrative, verbatim from the data. */
function excerpt(study: CaseStudy): string {
  const opening = study.narrative[0] ?? "";
  const two = opening.split(". ").slice(0, 2).join(". ");
  return two.endsWith(".") ? two : `${two}.`;
}

const PV_SLUGS = [
  "paradise-valley-whole-home-build",
  "paradise-valley-kitchen-and-baths",
  "paradise-valley-structural-phase",
];

/** Real frames from the estate, in build order, plus the approved rendering. */
const estatePlates = [
  {
    src: "/images/build-02-framing.jpg",
    alt: "Steel stud framing standing on the slab of the Paradise Valley estate",
    caption: "Framing · filmed on site",
  },
  {
    src: "/images/steel-aerial-frame.jpg",
    alt: "Drone aerial of the steel deck on the Paradise Valley estate",
    caption: "Steel deck · filmed on site",
  },
  {
    src: "/images/vision-entry.jpg",
    alt: "Client-approved rendering of the finished estate entry",
    caption: "Rendering · estate in progress",
  },
];

export default function PortfolioPage() {
  const estate = PV_SLUGS.map((slug) =>
    caseStudies.find((study) => study.slug === slug)
  ).filter((study): study is CaseStudy => Boolean(study));

  const remodels = caseStudies.filter(
    (study) => !PV_SLUGS.includes(study.slug)
  );

  return (
    <>
      <FullBleedHero
        media={{
          kind: "image",
          src: "/images/work-hero-aerial.jpg",
          alt: "Drone aerial of the steel deck on the active Paradise Valley build",
          kenBurns: true,
        }}
        label="Drone aerial of the steel deck on the active Paradise Valley build"
        mediaCaption="Filmed over the active Paradise Valley build"
        eyebrow="The Work"
        title={
          <>
            Case <em className="font-normal italic text-gold">Studies</em>
          </>
        }
        description="A ground-up estate in Paradise Valley, told in three chapters, and three Scottsdale remodels carried by the same in-house crews."
      />

      {/* ---- The estate: one build, three chapters, on the page ground so
           the real footage carries it. ---- */}
      {estate.length > 0 ? (
        <section
          className="relative py-[clamp(72px,9vh,112px)]"
          aria-label="The Paradise Valley estate"
        >
          <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <span className="section-label !mb-0">The Estate</span>
            <h2 className="mt-6 max-w-[18ch] font-heading text-[clamp(32px,4.2vw,54px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white">
              One build, told in{" "}
              <em className="font-normal italic text-gold">three chapters.</em>
            </h2>
            <p className="mt-6 max-w-[58ch] text-[15.5px] leading-[1.8] text-off-white/70">
              A ground-up estate in Paradise Valley, still on the boards as we
              write this. The structure, the kitchen and baths, and the
              framing phase each got their own study, because each was its own
              scope of work carried by the same crew.
            </p>

            <ul className="mt-[clamp(40px,6vh,64px)] grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-3">
              {estatePlates.map((plate) => (
                <li key={plate.src}>
                  <figure className="m-0">
                    <div className="relative aspect-[4/3] overflow-hidden border border-gold/[0.22] bg-teal">
                      <Image
                        src={plate.src}
                        alt={plate.alt}
                        fill
                        sizes="(max-width: 640px) 100vw, 33vw"
                        className="object-cover"
                      />
                    </div>
                    <figcaption className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-off-white/[0.55]">
                      {plate.caption}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>

            <ol className="mt-[clamp(40px,6vh,64px)] m-0 grid list-none grid-cols-1 gap-px border border-off-white/[0.12] bg-off-white/[0.12] p-0 lg:grid-cols-3">
              {estate.map((study, i) => (
                <li key={study.slug} className="bg-teal-dark">
                  <Link
                    href={`/portfolio/${study.slug}`}
                    className="group flex h-full flex-col p-7 no-underline transition-colors duration-500 hover:bg-[#203939] lg:p-9"
                  >
                    <div className="font-mono text-[10.5px] tracking-[0.25em] text-gold tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="mt-5 text-[10.5px] font-medium uppercase tracking-[0.22em] text-off-white/60">
                      {study.category}
                    </div>
                    <h3 className="mt-3 font-heading text-[22px] font-medium leading-[1.25] tracking-[-0.01em] text-off-white lg:text-[25px]">
                      {study.title.replace("Paradise Valley · ", "")}
                    </h3>
                    <p className="mt-4 max-w-[42ch] text-[13.5px] leading-[1.7] text-off-white/[0.62]">
                      {excerpt(study)}
                    </p>
                    <span className="mt-auto flex items-center gap-2 pt-7 text-[11px] font-medium uppercase tracking-[0.18em] text-off-white/60 transition-colors duration-500 group-hover:text-gold">
                      Read the chapter
                      <ArrowRight
                        className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {/* ---- The remodels: a compact typographic index on the cream
           interlude. The drawn motifs that used to head these entries came
           off — three unrelated details at three different weights read as
           decoration, and the studies have no photography to anchor them. ---- */}
      <section
        className="night-on-cream relative border-y border-gold/[0.35] bg-off-white py-[clamp(72px,9vh,112px)] text-charcoal"
        aria-label="Scottsdale remodels"
      >
        <div className="night-cream-grid" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <span className="section-label !mb-0">Scottsdale Remodels</span>
          <h2 className="mt-6 max-w-[26ch] text-balance font-heading text-[clamp(32px,4.2vw,54px)] font-medium leading-[1.12] tracking-[-0.02em] text-charcoal">
            Three homes,{" "}
            <em className="font-normal italic text-gold-display">
              carried in-house.
            </em>
          </h2>
          <p className="mt-6 max-w-[58ch] text-[15.5px] leading-[1.8] text-charcoal-light">
            Kitchen, bath, and whole-home work across McCormick Ranch,
            Pinnacle Peak, and Gainey Ranch. Every trade on these jobs ran
            through our own licensed crews, demolition to final fixture.
          </p>

          <ul className="mt-[clamp(44px,6vh,72px)] grid list-none grid-cols-1 gap-x-8 gap-y-12 p-0 sm:grid-cols-3">
            {remodels.map((study, i) => {
              return (
                <li key={study.slug} className="group">
                  <div className="border-t-2 border-gold-accessible/50 pt-6">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-[11px] tracking-[0.2em] text-gold-accessible tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-charcoal/[0.55]">
                        {study.category}
                      </span>
                    </div>
                    <h3 className="mt-4 font-heading text-[clamp(22px,2.3vw,27px)] font-medium leading-[1.2] tracking-[-0.01em]">
                      <Link
                        href={`/portfolio/${study.slug}`}
                        className="text-charcoal no-underline transition-colors duration-500 group-hover:text-gold-display"
                      >
                        {study.title}
                      </Link>
                    </h3>
                    <p className="mt-4 text-[13.5px] leading-[1.7] text-charcoal-light">
                      {excerpt(study)}
                    </p>
                    <Link
                      href={`/portfolio/${study.slug}`}
                      className="mt-6 inline-flex items-center gap-2 border-b border-gold-accessible/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-accessible no-underline transition-colors hover:border-gold-accessible"
                    >
                      Read the case study
                      <ArrowRight
                        className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <CTABanner />
    </>
  );
}
