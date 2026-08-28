"use client";

/**
 * Homepage case-study showcase — photo-free replacement for WorkShowcase.
 * Features the flagship 40th Street Estate with its on-site reel (dusk
 * treatment, gold edge-light) and a drawn plan fragment, then ledgers the
 * remaining case studies as linework cards. All copy is pulled from
 * src/data/case-studies.ts.
 */

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { ArrowRight } from "lucide-react";
import { caseStudies, getCaseStudy } from "@/data/case-studies";
import { CaseStudyCard } from "@/components/CaseStudyCard";
import { VideoReel } from "@/components/VideoReel";
import { PlanFragment } from "@/components/linework";

const EASE = [0.22, 1, 0.36, 1] as const;

const FLAGSHIP_SLUG = "fortieth-street-estate";

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: EASE, delay },
  }),
};

export function CaseStudyShowcase() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const flagship = getCaseStudy(FLAGSHIP_SLUG);
  const rest = caseStudies.filter((cs) => cs.slug !== FLAGSHIP_SLUG);

  if (!flagship) return null;

  const initial = prefersReducedMotion ? "visible" : "hidden";
  const viewport = { once: true, margin: "-36px" } as const;
  // Lede: the opening of the flagship narrative, verbatim.
  const lede = flagship.narrative[0]?.split(". ").slice(0, 2).join(". ") + ".";

  return (
    <section
      className="relative overflow-hidden py-[clamp(96px,13vh,160px)]"
      aria-label="Case study"
      id="work"
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        {/* ---- Flagship: 40th Street Estate ---- */}
        <div className="grid items-start gap-[clamp(40px,6vw,96px)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div>
            <motion.div
              variants={revealVariants}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <span className="section-label !mb-0">Case Study</span>
              <h2 className="mt-6 font-heading text-[clamp(38px,4.6vw,64px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white">
                The 40th Street{" "}
                <em className="font-normal italic text-gold">Estate</em>
              </h2>
              <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.22em] text-off-white/60">
                <span className="text-gold">{flagship.neighborhood}</span> ·{" "}
                {flagship.category}
              </div>
              <p className="mt-6 max-w-[540px] text-[15.5px] leading-[1.8] text-off-white/70">
                {lede}
              </p>
            </motion.div>

            <motion.dl
              className="mt-9 border-t border-off-white/[0.14]"
              variants={revealVariants}
              custom={0.12}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              {flagship.specs.map((spec) => (
                <div
                  key={spec.label}
                  className="grid grid-cols-[110px_1fr] gap-4 border-b border-off-white/[0.14] py-3.5 sm:grid-cols-[150px_1fr]"
                >
                  <dt className="pt-0.5 text-[10.5px] font-medium uppercase tracking-[0.22em] text-off-white/55">
                    {spec.label}
                  </dt>
                  <dd className="m-0 text-[13px] text-off-white">{spec.value}</dd>
                </div>
              ))}
            </motion.dl>

            <motion.div
              className="mt-8"
              variants={revealVariants}
              custom={0.2}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <div className="text-[10.5px] font-medium uppercase tracking-[0.25em] text-gold">
                Selected Scope
              </div>
              <ul className="mt-4 grid list-none grid-cols-1 gap-x-7 gap-y-2.5 p-0 min-[480px]:grid-cols-2">
                {flagship.scope.slice(0, 10).map((item) => (
                  <li
                    key={item}
                    className="relative pl-5 text-[13.5px] leading-snug text-off-white/80"
                  >
                    <span
                      className="absolute left-0 top-[0.62em] h-px w-2.5 bg-gold"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Plan fragment — great room opening to the pool terrace */}
            <figure className="mb-0 ml-0 mr-0 mt-12" aria-hidden="true">
              <PlanFragment className="block h-auto w-full max-w-[560px]" glow />
              <figcaption className="mt-3.5 text-[10.5px] uppercase tracking-[0.18em] text-off-white/60">
                Plan fragment · Great room opening to pool terrace
              </figcaption>
            </figure>

            <motion.div
              className="mt-10"
              variants={revealVariants}
              custom={0.1}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <Link
                href={`/portfolio/${flagship.slug}`}
                className="inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold no-underline transition-colors hover:border-gold"
              >
                View the full case study
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </motion.div>
          </div>

          {/* ---- On-site reel — dusk treatment + gold edge-light ---- */}
          <motion.div
            className="flex flex-col items-start lg:sticky lg:top-[110px] lg:items-center"
            variants={revealVariants}
            custom={0.15}
            initial={initial}
            whileInView="visible"
            viewport={viewport}
          >
            {flagship.reel ? (
              <>
                <div className="night-reel night-reel--dusk w-[min(320px,80vw)]">
                  <VideoReel
                    src={flagship.reel.src}
                    poster={flagship.reel.poster}
                    label={flagship.reel.label}
                    aspect="9x16"
                    mode="autoloop"
                    className="rounded-none bg-teal-dark"
                  />
                  <span className="night-reel-chip">On Site</span>
                  {/* No in-frame label: the stitched reel carries its own
                      baked-in caption in the lower third. */}
                </div>
                <div className="mt-4 text-[10.5px] uppercase tracking-[0.2em] text-off-white/60">
                  Filmed on site · {flagship.neighborhood}
                </div>
              </>
            ) : null}
          </motion.div>
        </div>

        {/* ---- The rest of the ledger ---- */}
        <div className="mt-[clamp(72px,10vh,120px)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <span className="section-label !mb-0">More Case Studies</span>
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-off-white/60 no-underline transition-colors hover:text-gold"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((study, i) => (
              <CaseStudyCard key={study.slug} study={study} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
