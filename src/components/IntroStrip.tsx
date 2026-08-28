"use client";

/**
 * Credentials band — 4 / 3 / 1 in large gold Fraunces with drafted
 * dimension-tick underlines, on a teal band distinct from the page ground.
 */

import { motion, useReducedMotion } from "framer-motion";
import { DimensionTicks } from "@/components/linework";

const EASE = [0.22, 1, 0.36, 1] as const;

const stats = [
  { number: "4", label: "Active ROC Licenses" },
  { number: "3", label: "Premier Neighborhoods" },
  { number: "1", label: "Point of Contact" },
];

export function IntroStrip() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      className="relative border-y border-gold/[0.22] bg-teal"
      role="region"
      aria-label="Key statistics"
    >
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-9 px-5 py-12 sm:px-8 md:grid-cols-[1fr_1px_1fr_1px_1fr] md:gap-0 md:py-16">
        {stats.map((stat, i) => (
          <div key={stat.label} className="contents">
            <motion.div
              className="px-5 text-center"
              initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-36px" }}
              transition={{ duration: 1, ease: EASE, delay: i * 0.12 }}
            >
              <div className="font-heading text-[clamp(64px,7vw,96px)] font-medium leading-none text-gold">
                {stat.number}
              </div>
              <DimensionTicks
                className="mx-auto mb-3 mt-3.5 block h-3.5 w-16"
                delay={0.3 + i * 0.22}
              />
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-off-white/75">
                {stat.label}
              </div>
            </motion.div>
            {i < stats.length - 1 && (
              <div
                className="hidden h-[84px] w-px justify-self-center bg-off-white/10 md:block"
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
