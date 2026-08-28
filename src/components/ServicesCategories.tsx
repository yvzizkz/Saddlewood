"use client";

/**
 * ServicesCategories — Night Blueprint plates.
 *
 * Four core scopes (Kitchen / Bathroom / Whole-Home / Outdoor Living) as
 * hairline-framed linework + type plates, following the homepage
 * ServicesGrid treatment: gold index numeral, self-drawing diagram from
 * the linework registry, Fraunces title, one scope line, and a quiet link
 * into the relevant work. No photography.
 */

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { lineworkRegistry } from "@/components/linework";

interface ServiceCategory {
  /** Service name, e.g. "Kitchen" */
  name: string;
  /** One-line summary of what's in scope. Direct, no buzzwords. */
  scope: string;
  /** Key into lineworkRegistry, e.g. "plan-fragment" */
  linework: string;
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
  const prefersReducedMotion = useReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";
  const viewport = { once: true, margin: "-36px" } as const;

  return (
    <section
      className="relative py-[clamp(90px,11vh,140px)]"
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
            Four scopes. One{" "}
            <em className="font-normal italic text-gold">in-house</em> team.
          </h2>
        </motion.div>

        {/* Plates */}
        <div className="mt-[clamp(48px,7vh,84px)] grid grid-cols-1 gap-px border border-off-white/[0.12] bg-off-white/[0.12] sm:grid-cols-2">
          {categories.map((cat, i) => {
            const Motif = lineworkRegistry[cat.linework];
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
                  {Motif ? (
                    <div className="mt-6" aria-hidden="true">
                      <Motif className="block h-[150px] w-full max-w-[320px]" />
                    </div>
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
