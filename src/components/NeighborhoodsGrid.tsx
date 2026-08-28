"use client";

/**
 * Full service-area hub, Night Blueprint v2 — the photo cards replaced by
 * an indexed Fraunces ledger over a faded, self-drawing NeighborhoodPlat
 * (same pattern as the homepage NeighborhoodCards, expanded with each
 * neighborhood's real one-line descriptor from src/lib/neighborhoods.ts).
 */

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { neighborhoods } from "@/lib/neighborhoods";
import { NeighborhoodPlat } from "@/components/linework";

const EASE = [0.22, 1, 0.36, 1] as const;

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: EASE, delay },
  }),
};

export function NeighborhoodsGrid() {
  const prefersReducedMotion = useReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";
  const viewport = { once: true, margin: "-36px" } as const;

  const hoods = Object.values(neighborhoods);

  return (
    <section
      className="relative overflow-hidden pb-[clamp(96px,12vh,150px)] pt-[clamp(28px,4vh,56px)]"
      aria-label="Neighborhoods we serve"
    >
      {/* Faded plat drawing behind the ledger */}
      <div
        className="pointer-events-none absolute -top-2.5 right-[-110px] w-[min(560px,52vw)] opacity-30 max-md:opacity-10 [mask-image:linear-gradient(to_bottom,#000_55%,transparent_96%)]"
        aria-hidden="true"
      >
        <NeighborhoodPlat className="block h-auto w-full" />
      </div>

      <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <div className="border-t border-off-white/[0.12]">
          {hoods.map((hood, i) => (
            <motion.div
              key={hood.slug}
              variants={revealVariants}
              custom={Math.min(i, 5) * 0.06}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <Link
                href={`/neighborhoods/${hood.slug}`}
                className="group grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-5 gap-y-2.5 border-b border-off-white/[0.12] py-7 no-underline transition-all duration-500 hover:border-gold/60 hover:pl-2.5 md:grid-cols-[auto_minmax(0,0.48fr)_minmax(0,0.52fr)_auto] md:gap-x-[clamp(24px,3vw,48px)]"
              >
                <span className="text-[10.5px] font-medium tracking-[0.2em] text-gold tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block font-heading text-[clamp(26px,3vw,40px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white transition-colors duration-500 group-hover:text-gold">
                    {hood.name}
                  </span>
                  <span className="mt-2 block text-[10px] font-medium uppercase tracking-[0.25em] text-gold/80">
                    {hood.zip}
                  </span>
                </span>
                <span className="col-start-2 max-w-[480px] text-[13.5px] leading-[1.7] text-off-white/[0.62] md:col-start-3 md:self-center">
                  {hood.tagline}
                </span>
                <span
                  className="hidden h-10 w-10 items-center justify-center rounded-[2px] border border-off-white/[0.18] transition-colors duration-500 group-hover:border-gold md:flex md:self-center"
                  aria-hidden="true"
                >
                  <ArrowRight className="h-4 w-4 text-off-white/50 transition-colors duration-500 group-hover:text-gold" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
