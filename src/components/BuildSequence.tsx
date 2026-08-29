"use client";

/**
 * "How it gets built" — the homepage's one-build story, told with the build
 * itself instead of a drawing of it (owner note, 2026-08-28: the traced
 * working-set section wasn't convincing, and a story would land harder).
 *
 * Three real frames from the active Paradise Valley steel build, in order:
 * the walls chalked onto the slab, the same lines standing in steel, the
 * crew that put them there. Then the payoff, wide: the client-approved
 * rendering of where it all lands, captioned as a rendering per the
 * standing content rule. Replaces SameHouseSection + PlanBuildAim, whose
 * three-moment trio made the same argument one card at a time.
 */

import Image from "next/image";
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

interface Beat {
  tag: string;
  src: string;
  alt: string;
  heading: string;
  caption: string;
}

const beats: Beat[] = [
  {
    tag: "01",
    src: "/images/build-01-layout.jpg",
    alt: "Tape measure over layout lines chalked on the new slab",
    heading: "Layout",
    caption: "Walls chalked onto the slab before a stud goes up.",
  },
  {
    tag: "02",
    src: "/images/build-02-framing.jpg",
    alt: "Steel stud framing standing on the slab, desert visible beyond",
    heading: "Framing",
    caption: "The same lines, standing in steel.",
  },
  {
    tag: "03",
    src: "/images/build-03-crew.jpg",
    alt: "Two Saddlewood crew members setting steel from a scaffold",
    heading: "The crew",
    caption: "Our own tradespeople, on our own payroll.",
  },
];

export function BuildSequence() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const variants = prefersReducedMotion ? revealStaticVariants : revealVariants;

  return (
    <section
      className="night-on-cream relative bg-off-white py-[clamp(72px,9vh,112px)] text-charcoal"
      aria-label="How it gets built"
    >
      <div className="night-cream-grid" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <span className="section-label !mb-0">How It Gets Built</span>
        <motion.h2
          variants={variants}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[20ch] font-heading text-[clamp(32px,4.4vw,54px)] font-medium leading-[1.12] tracking-[-0.02em] text-charcoal"
        >
          Chalked on the slab. Then{" "}
          <em className="font-normal italic text-gold-display">
            built to the line.
          </em>
        </motion.h2>
        <motion.p
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[56ch] text-[15.5px] leading-[1.8] text-charcoal-light"
        >
          On the active Paradise Valley build, the walls were marked out on
          the concrete before a stud went up, then framed in steel by the same
          crew that laid them out. One point of contact, from the first chalk
          line to the last detail.
        </motion.p>

        <ol className="mt-[clamp(36px,5vh,56px)] grid list-none grid-cols-1 gap-x-6 gap-y-10 p-0 sm:grid-cols-3">
          {beats.map((beat, i) => (
            <motion.li
              key={beat.tag}
              variants={variants}
              custom={REVEAL_STEP * i}
              initial="hidden"
              whileInView="visible"
              viewport={REVEAL_VIEWPORT}
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-stone">
                <Image
                  src={beat.src}
                  alt={beat.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover"
                />
              </div>
              <div className="mt-4 flex items-baseline gap-3">
                <span className="font-mono text-[11px] tracking-[0.2em] text-gold-accessible tabular-nums">
                  {beat.tag}
                </span>
                <h3 className="font-heading text-[19px] font-medium leading-[1.3] tracking-[-0.01em] text-charcoal">
                  {beat.heading}
                </h3>
              </div>
              <p className="mt-2 max-w-[34ch] text-[13.5px] leading-[1.7] text-charcoal-light">
                {beat.caption}
              </p>
            </motion.li>
          ))}
        </ol>

        <motion.div
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-10"
        >
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-2 border-b border-gold-accessible/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-accessible no-underline transition-colors hover:border-gold-accessible"
          >
            View the case studies
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
