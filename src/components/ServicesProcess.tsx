"use client";

/**
 * ServicesProcess — Night Blueprint drawn process timeline.
 *
 * The six construction phases of the completed Paradise Valley whole-home
 * build as a typographic ledger: gold Fraunces numerals over dimension-tick strings,
 * the phase label, and the single line describing what that phase became
 * in the finished home. Closes with the payoff statement and a link into
 * the full case study. No photography.
 */

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { REVEAL_VIEWPORT } from "@/lib/reveal";
import { ArrowRight } from "lucide-react";
import { BlueprintDivider, DimensionTicks } from "@/components/linework";

export interface ProcessPhase {
  /** Phase numeral, e.g. "01" */
  number: string;
  /** Phase label drawn from project data */
  label: string;
  /** What this phase became in the finished home. Single line, no marketing voice. */
  outcome: string;
}

export interface ServicesProcessProps {
  phases: ProcessPhase[];
  /** Closing payoff statement after the sequence. */
  closing: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const revealVariants: Variants = {
  hidden: { opacity: 0.12, y: 22 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: EASE, delay },
  }),
};

export function ServicesProcess({ phases, closing }: ServicesProcessProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";
  const viewport = REVEAL_VIEWPORT;

  return (
    <section
      className="relative py-[clamp(72px,9vh,112px)]"
      aria-label="From construction to finished home"
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        {/* Head */}
        <motion.div
          className="max-w-[680px]"
          variants={revealVariants}
          initial={initial}
          whileInView="visible"
          viewport={viewport}
        >
          <span className="section-label !mb-0">From Demo to Finish</span>
          <h2 className="mt-6 font-heading text-[clamp(34px,4.2vw,56px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white">
            One project. Every trade. Start to finish.
          </h2>
          <p className="mt-5 max-w-[560px] text-[15.5px] leading-[1.8] text-off-white/70">
            A Paradise Valley whole-home build, from the day we broke ground to
            the day the homeowner moved in. General, electrical, plumbing, and
            HVAC: all our own crew, all four ROC licenses on the same job site.
          </p>
          <div className="mt-9" aria-hidden="true">
            <BlueprintDivider className="block h-6 w-[180px]" />
          </div>
        </motion.div>

        {/* Phase ledger */}
        <ol
          className="mt-[clamp(44px,6vh,72px)] list-none border-t border-off-white/[0.14] p-0"
          role="list"
        >
          {phases.map((phase, i) => (
            <motion.li
              key={phase.number}
              className="grid grid-cols-[72px_1fr] items-start gap-x-6 border-b border-off-white/[0.14] py-8 sm:grid-cols-[96px_1fr] sm:gap-x-10 lg:grid-cols-[96px_minmax(0,0.55fr)_minmax(0,1fr)] lg:py-10"
              variants={revealVariants}
              custom={Math.min(i, 3) * 0.08}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <div>
                <span className="block font-heading text-[clamp(30px,3.4vw,44px)] font-medium leading-none text-gold">
                  {phase.number}
                </span>
                <div aria-hidden="true">
                  <DimensionTicks className="mt-3 block h-[10px] w-12 sm:w-14" />
                </div>
              </div>
              <h3 className="m-0 pt-1.5 text-[12px] font-medium uppercase tracking-[0.22em] text-off-white sm:text-[13px]">
                {phase.label}
              </h3>
              <p className="col-span-2 m-0 mt-4 max-w-[560px] text-[14px] leading-[1.75] text-off-white/[0.65] lg:col-span-1 lg:mt-0 lg:pt-1">
                {phase.outcome}
              </p>
            </motion.li>
          ))}
        </ol>

        {/* Payoff */}
        <motion.div
          className="mt-[clamp(48px,7vh,80px)] max-w-[720px]"
          variants={revealVariants}
          custom={0.1}
          initial={initial}
          whileInView="visible"
          viewport={viewport}
        >
          <div className="text-[10.5px] font-medium uppercase tracking-[0.25em] text-gold">
            The Result
          </div>
          <p className="mt-4 font-heading text-[clamp(22px,2.6vw,30px)] font-medium italic leading-[1.4] text-off-white">
            {closing}
          </p>
          <Link
            href="/portfolio/paradise-valley-whole-home-build"
            className="mt-7 inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold no-underline transition-colors hover:border-gold"
          >
            See the full project
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
