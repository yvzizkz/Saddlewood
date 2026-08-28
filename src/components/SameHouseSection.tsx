"use client";

/**
 * "Same house as the reel." — cream working-set section directly under the
 * hero. The garage-side elevation is traced from the working drawings of
 * the estate framing in the hero reel above; it sketches itself in on
 * scroll. Handoff demo section 2, in Night Blueprint tokens.
 */

import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import {
  revealVariants,
  revealStaticVariants,
  REVEAL_STEP,
  REVEAL_VIEWPORT,
} from "@/lib/reveal";
import { DrawingToRender } from "@/components/DrawingToRender";

export function SameHouseSection() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const variants = prefersReducedMotion ? revealStaticVariants : revealVariants;

  return (
    <section
      className="night-on-cream relative bg-off-white py-[clamp(72px,9vh,112px)] text-charcoal"
      aria-label="The working set"
    >
      <div className="night-cream-grid" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <span className="section-label !mb-0">The Working Set</span>
        <motion.h2
          variants={variants}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[18ch] font-heading text-[clamp(32px,4.4vw,54px)] font-medium leading-[1.12] tracking-[-0.02em] text-charcoal"
        >
          Same house as the{" "}
          <em className="font-normal italic text-gold-display">reel.</em>
        </motion.h2>
        <motion.p
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[54ch] text-[15.5px] leading-[1.8] text-charcoal-light"
        >
          The elevation below is traced from the working drawings of the
          estate framing above. It sketches itself in, then sweeps into the
          client-approved rendering of the same view.
        </motion.p>

        <motion.div
          variants={variants}
          custom={REVEAL_STEP * 2}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
        >
          <DrawingToRender />
        </motion.div>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-gold-accessible">
          Garage side · traced from the project&apos;s working set · Paradise Valley
        </p>
      </div>
    </section>
  );
}
