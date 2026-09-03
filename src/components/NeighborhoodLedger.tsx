"use client";

/**
 * Service-area ledger — the eight neighborhoods as numbered drafting rows
 * with a gold rule that draws across each row on scroll (handoff demo's
 * "hoods" pattern). Each row links to its neighborhood page. Cream
 * interlude ground per the premium-standard homepage rhythm.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import {
  revealVariants,
  revealStaticVariants,
  REVEAL_STEP,
  REVEAL_VIEWPORT,
  REVEAL_EASE,
} from "@/lib/reveal";
import { neighborhoods } from "@/lib/neighborhoods";

// Demo order — Paradise Valley leads, then north-to-south Scottsdale.
const HOOD_ORDER = [
  "paradise-valley",
  "silverleaf",
  "dc-ranch",
  "mccormick-ranch",
  "gainey-ranch",
  "grayhawk",
  "pinnacle-peak",
  "arcadia",
];

export function NeighborhoodLedger() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const variants = prefersReducedMotion ? revealStaticVariants : revealVariants;

  const hoods = HOOD_ORDER.map((slug) => neighborhoods[slug]).filter(Boolean);

  return (
    <section
      className="night-on-cream relative bg-off-white py-[clamp(72px,9vh,112px)] text-charcoal"
      aria-label="Service area"
    >
      <div className="night-cream-grid" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <span className="section-label !mb-0">Service Area</span>
        <motion.h2
          variants={variants}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[18ch] font-heading text-[clamp(32px,4.4vw,54px)] font-medium leading-[1.12] tracking-[-0.02em] text-charcoal"
        >
          Proudly serving Scottsdale.
        </motion.h2>
        <motion.p
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[54ch] text-[15.5px] leading-[1.8] text-charcoal-light"
        >
          Hyper-local focus means deeper expertise and stronger relationships
          in the communities where we work.
        </motion.p>

        <div className="mt-11 grid grid-cols-1 gap-x-16 md:grid-cols-2">
          {hoods.map((hood, i) => (
            <div key={hood.slug} className="relative border-b border-charcoal/[0.14]">
              <Link
                href={`/neighborhoods/${hood.slug}`}
                className="group flex items-baseline gap-[18px] py-[22px] no-underline"
              >
                <span className="font-mono text-[11px] text-gold-accessible">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-heading text-[clamp(21px,2.2vw,26px)] font-medium text-charcoal transition-colors group-hover:text-gold-accessible">
                  {hood.name}
                </span>
              </Link>
              {/* Gold rule draws across the row once visible */}
              <motion.span
                aria-hidden="true"
                className="absolute bottom-[-1px] left-0 h-px bg-gold-accessible"
                initial={{ width: prefersReducedMotion ? "100%" : 0 }}
                whileInView={{ width: "100%" }}
                viewport={{ once: true, amount: 0.4 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { duration: 1, ease: REVEAL_EASE, delay: (i % 2) * 0.15 }
                }
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
