"use client";

/**
 * Homepage service sections: the full-scope ledger on a cream interlude
 * ("One contractor for the whole scope.") and the Framing pair on the dark
 * ground ("Engineered, then self-performed.").
 *
 * The scope section replaced a drawn kitchen elevation paired with remodel
 * footage (owner note, 2026-08-28: the drawing did not connect to the
 * footage beside it, and the page never said the company does everything
 * else). The panel now carries the scope in words and keeps the footage as
 * the evidence beside it.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import {
  revealVariants,
  revealStaticVariants,
  REVEAL_STEP,
  REVEAL_VIEWPORT,
} from "@/lib/reveal";
import { SheetPair } from "@/components/SheetPair";
import { VideoPanel } from "@/components/VideoPanel";
import { ShearWallSheet } from "@/components/linework";

/** Real scope, matched to what the services pages already claim. */
const scopeLines: { name: string; detail: string }[] = [
  {
    name: "New construction",
    detail: "Ground-up estates, framed and finished by our own crew.",
  },
  {
    name: "Whole-home remodels",
    detail: "Demolition through final punch list on one contract.",
  },
  {
    name: "Kitchens & baths",
    detail: "Millwork, stone, tile, and the fixtures to match.",
  },
  {
    name: "Additions & structural",
    detail: "Steel framing and shear work built to the engineer's set.",
  },
  {
    name: "Outdoor living",
    detail: "Pools, covered patios, outdoor kitchens, architectural lighting.",
  },
  {
    name: "Mechanical, electrical, plumbing",
    detail: "Self-performed under our own trade licenses.",
  },
];

export function FullScopeSection() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const variants = prefersReducedMotion ? revealStaticVariants : revealVariants;

  return (
    <section
      className="night-on-cream relative bg-off-white py-[clamp(72px,9vh,112px)] text-charcoal"
      aria-label="Full scope of work"
    >
      <div className="night-cream-grid" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <span className="section-label !mb-0">Services · Full Scope</span>
        <motion.h2
          variants={variants}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[20ch] font-heading text-[clamp(32px,4.4vw,54px)] font-medium leading-[1.12] tracking-[-0.02em] text-charcoal"
        >
          One contractor for the whole scope.
        </motion.h2>
        <motion.p
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[58ch] text-[15.5px] leading-[1.8] text-charcoal-light"
        >
          A kitchen is usually where the conversation starts. We carry the
          rest of it too: ground-up new construction, whole-home remodels,
          additions, outdoor living, and the mechanical, electrical, and
          plumbing behind the walls. We hold those trade licenses ourselves,
          so your project does not get handed off at the drywall line.
        </motion.p>

        <div className="mt-11 grid grid-cols-1 items-stretch gap-[22px] lg:grid-cols-[1.15fr_0.85fr]">
          {/* Scope ledger — the argument in words, where the drawing was */}
          <motion.div
            variants={variants}
            initial="hidden"
            whileInView="visible"
            viewport={REVEAL_VIEWPORT}
            className="relative flex flex-col border border-stone-mid bg-[#faf6ea]"
          >
            <span className="absolute left-3.5 top-3.5 z-[2] border border-stone-mid bg-off-white/90 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-gold-accessible">
              What we build
            </span>
            <ul className="m-0 flex flex-1 list-none flex-col justify-center gap-0 p-0 pt-[58px]">
              {scopeLines.map((line, i) => (
                <li
                  key={line.name}
                  className={`px-6 py-[18px] sm:px-8 ${
                    i > 0 ? "border-t border-stone-mid/70" : ""
                  }`}
                >
                  <div className="font-heading text-[18px] font-medium leading-[1.3] tracking-[-0.01em] text-charcoal sm:text-[19px]">
                    {line.name}
                  </div>
                  <p className="mt-1.5 max-w-[46ch] text-[13.5px] leading-[1.65] text-charcoal-light">
                    {line.detail}
                  </p>
                </li>
              ))}
            </ul>
            <div className="border-t border-stone-mid px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#8a8672]">
              New construction and remodels · Scottsdale &amp; Paradise Valley
            </div>
          </motion.div>

          {/* Evidence: a remodel actually underway */}
          <motion.div
            variants={variants}
            custom={REVEAL_STEP}
            initial="hidden"
            whileInView="visible"
            viewport={REVEAL_VIEWPORT}
            className="relative flex flex-col border border-stone-mid bg-[#faf6ea]"
          >
            <span className="absolute left-3.5 top-3.5 z-[2] border border-stone-mid bg-off-white/90 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-gold-accessible">
              On site
            </span>
            <div className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden">
              <VideoPanel
                src="/videos/saddlewood-reel-troon-kitchen-9x16.mp4"
                poster="/videos/saddlewood-reel-troon-kitchen-9x16-poster.jpg"
                label="Kitchen segment of a remodel walkthrough filmed on site"
              />
            </div>
            <div className="border-t border-stone-mid px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#8a8672]">
              Kitchen remodel underway · filmed on site
            </div>
          </motion.div>
        </div>

        <motion.div
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-10"
        >
          <Link
            href="/services"
            className="inline-flex items-center gap-2 border-b border-gold-accessible/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-accessible no-underline transition-colors hover:border-gold-accessible"
          >
            All services
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

export function FramingPairSection() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const variants = prefersReducedMotion ? revealStaticVariants : revealVariants;

  return (
    <section
      className="relative py-[clamp(72px,9vh,112px)]"
      aria-label="Framing"
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <span className="section-label !mb-0">Services · Framing</span>
        <motion.h2
          variants={variants}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[20ch] font-heading text-[clamp(32px,4.4vw,54px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white"
        >
          Engineered, then self-performed.
        </motion.h2>
        <motion.p
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[54ch] text-[15.5px] leading-[1.8] text-off-white/70"
        >
          Steel studs at 16 inches on center, shear panels screwed to
          schedule, holdowns where the plans call them. The crew that reads
          the S-sheets installs them.
        </motion.p>

        <div className="mt-11">
          <SheetPair
            tone="dark"
            left={{
              tag: "Drawn",
              caption: "Traced from the engineer's structural set",
              children: (
                <div className="w-full p-4">
                  <ShearWallSheet className="block h-auto w-full" />
                </div>
              ),
            }}
            right={{
              tag: "Installed",
              caption: "Structural phase · Paradise Valley · self-performed",
              aspect: "min-h-[320px]",
              children: (
                <VideoPanel
                  src="/videos/saddlewood-scaffold-loop.mp4"
                  poster="/videos/saddlewood-scaffold-loop-poster.jpg"
                  label="Slowed pass of scaffold work on the active Paradise Valley build"
                />
              ),
            }}
          />
        </div>

        <motion.div
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-10"
        >
          <Link
            href="/framing"
            className="inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold no-underline transition-colors hover:border-gold"
          >
            Framing for builders
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
