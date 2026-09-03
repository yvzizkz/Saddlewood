"use client";

/**
 * ServicesCategories — Night Blueprint plates.
 *
 * Four core scopes (Kitchen / Bathroom / Whole-Home / Outdoor Living) as
 * hairline-framed plates: gold index numeral, media, Fraunces title, one
 * scope line, and a quiet link into the relevant work.
 *
 * Media policy (owner directive, 2026-08-30): footage frames, renderings,
 * and generated or AI-enhanced studies are all fair game on these cards.
 * The caption is what has to stay honest — "filmed on site" and named
 * projects mean exactly that; everything else is captioned for what it is
 * ("Rendering", "Study") or left uncaptioned where it reads as decoration.
 */

import Link from "next/link";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { REVEAL_VIEWPORT } from "@/lib/reveal";
import { ArrowRight } from "lucide-react";

interface ServiceCategory {
  /** Service name, e.g. "Kitchen" */
  name: string;
  /** One-line summary of what's in scope. Direct, no buzzwords. */
  scope: string;
  /** Real media for the card. Absent = typographic plate. */
  media?: { src: string; alt: string; caption?: string };
  /** Where to send visitors who want to see more (portfolio or case study) */
  href: string;
  /** Friendly link label */
  hrefLabel: string;
}

interface ServicesCategoriesProps {
  categories: ServiceCategory[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: EASE, delay },
  }),
};

export function ServicesCategories({ categories }: ServicesCategoriesProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";
  const viewport = REVEAL_VIEWPORT;

  return (
    <section
      className="relative py-[clamp(72px,9vh,112px)]"
      aria-label="Core services"
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
          <span className="section-label !mb-0">What We Build</span>
          <h2 className="mt-6 font-heading text-[clamp(34px,4.2vw,56px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white">
            Four scopes. One in-house team.
          </h2>
        </motion.div>

        {/* Plates */}
        <div className="mt-[clamp(48px,7vh,84px)] grid grid-cols-1 gap-px border border-off-white/[0.12] bg-off-white/[0.12] sm:grid-cols-2">
          {categories.map((cat, i) => {
            return (
              <motion.article
                key={cat.name}
                className="h-full"
                variants={revealVariants}
                custom={(i % 2) * 0.12}
                initial={initial}
                whileInView="visible"
                viewport={viewport}
              >
                <Link
                  href={cat.href}
                  className="group flex h-full flex-col bg-teal-dark p-7 no-underline transition-colors duration-500 hover:bg-[#203939] lg:p-10"
                >
                  <div className="text-[10.5px] font-medium tracking-[0.25em] text-gold">
                    0{i + 1}
                  </div>
                  {cat.media ? (
                    <figure className="m-0 mt-6">
                      <div className="relative aspect-[16/10] overflow-hidden border border-gold/[0.22]">
                        <Image
                          src={cat.media.src}
                          alt={cat.media.alt}
                          fill
                          sizes="(max-width: 640px) 100vw, 50vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                        />
                      </div>
                      {cat.media.caption ? (
                        <figcaption className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-off-white/[0.55]">
                          {cat.media.caption}
                        </figcaption>
                      ) : null}
                    </figure>
                  ) : null}
                  <h3 className="mt-6 font-heading text-[22px] font-medium leading-[1.25] text-off-white lg:text-[26px]">
                    {cat.name}
                  </h3>
                  <p className="mt-3 max-w-[420px] text-[13.5px] leading-[1.7] text-off-white/[0.62]">
                    {cat.scope}
                  </p>
                  <span className="mt-auto flex items-center gap-2 pt-7 text-[11px] font-medium uppercase tracking-[0.18em] text-off-white/60 transition-colors duration-500 group-hover:text-gold">
                    {cat.hrefLabel}
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
