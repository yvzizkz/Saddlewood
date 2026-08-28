"use client";

/**
 * Service-area ledger — the 8 neighborhoods as an indexed Fraunces list
 * over a faded, self-drawing NeighborhoodPlat. Slugs match
 * src/lib/neighborhoods.ts and the /neighborhoods/* routes.
 */

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { ArrowRight } from "lucide-react";
import { NeighborhoodPlat } from "@/components/linework";

const EASE = [0.22, 1, 0.36, 1] as const;

const hoods = [
  { name: "Paradise Valley", slug: "paradise-valley" },
  { name: "Silverleaf", slug: "silverleaf" },
  { name: "DC Ranch", slug: "dc-ranch" },
  { name: "McCormick Ranch", slug: "mccormick-ranch" },
  { name: "Gainey Ranch", slug: "gainey-ranch" },
  { name: "Grayhawk", slug: "grayhawk" },
  { name: "Pinnacle Peak", slug: "pinnacle-peak" },
  { name: "Arcadia", slug: "arcadia" },
];

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: EASE, delay },
  }),
};

export function NeighborhoodCards() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";
  const viewport = { once: true, margin: "-36px" } as const;

  return (
    <section
      className="relative overflow-hidden py-[clamp(110px,14vh,170px)]"
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
        <motion.div
          className="max-w-[600px]"
          variants={revealVariants}
          initial={initial}
          whileInView="visible"
          viewport={viewport}
        >
          <span className="section-label !mb-0">Service Area</span>
          <h2 className="mt-6 font-heading text-[clamp(36px,4.4vw,60px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white">
            Proudly Serving{" "}
            <em className="font-normal italic text-gold">Scottsdale.</em>
          </h2>
          <p className="mt-5 max-w-[460px] text-[14.5px] leading-[1.75] text-off-white/[0.62]">
            Our hyper-local focus means deeper expertise and stronger
            relationships in the communities where we&nbsp;work.
          </p>
        </motion.div>

        <div className="mt-[clamp(44px,6vh,72px)] grid grid-cols-1 gap-x-[clamp(40px,6vw,96px)] md:grid-cols-2">
          {hoods.map((hood, i) => (
            <motion.div
              key={hood.slug}
              variants={revealVariants}
              custom={(i % 2) * 0.12}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <Link
                href={`/neighborhoods/${hood.slug}`}
                className="group flex items-baseline gap-5 border-b border-off-white/[0.12] py-5 no-underline transition-all duration-500 hover:border-gold/60 hover:pl-2.5"
              >
                <span className="text-[10.5px] font-medium tracking-[0.2em] text-gold tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-heading text-[clamp(24px,2.4vw,31px)] font-medium leading-[1.2] tracking-[-0.02em] text-off-white transition-colors duration-500 group-hover:text-gold">
                  {hood.name}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="mt-10"
          variants={revealVariants}
          custom={0.1}
          initial={initial}
          whileInView="visible"
          viewport={viewport}
        >
          <Link
            href="/neighborhoods"
            className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-off-white/60 no-underline transition-colors hover:text-gold"
          >
            All service areas
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
