"use client";

/**
 * Photo-free case-study card for the Night Blueprint homepage showcase.
 * Hairline-framed panel on the page ground: gold meta line, small
 * self-drawing linework motif (via lineworkRegistry), Fraunces title,
 * a scope line, and a link into /portfolio/[slug].
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { ArrowRight } from "lucide-react";
import type { CaseStudy } from "@/data/case-studies";
import { lineworkRegistry } from "@/components/linework";

const EASE = [0.22, 1, 0.36, 1] as const;

export interface CaseStudyCardProps {
  study: CaseStudy;
  /** Position in the grid — drives the reveal stagger. */
  index?: number;
}

export function CaseStudyCard({ study, index = 0 }: CaseStudyCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const Motif = lineworkRegistry[study.linework];
  const scopeLine = study.scope.slice(0, 2).join(" · ");

  return (
    <motion.article
      className="h-full"
      initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-36px" }}
      transition={{ duration: 0.9, ease: EASE, delay: (index % 3) * 0.12 }}
    >
      <Link
        href={`/portfolio/${study.slug}`}
        className="group flex h-full flex-col border border-off-white/[0.12] p-7 no-underline transition-colors duration-500 hover:border-gold/50 sm:p-8"
      >
        <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-gold">
          {study.neighborhood}
          <span className="text-off-white/50"> · {study.category}</span>
        </div>

        {Motif ? (
          <div className="mt-6" aria-hidden="true">
            <Motif className="block h-[130px] w-full" />
          </div>
        ) : null}

        <h3 className="mt-6 font-heading text-[22px] font-medium leading-[1.25] text-off-white sm:text-[24px]">
          {study.title}
        </h3>

        <p className="mt-3 text-[13.5px] leading-[1.7] text-off-white/60">
          {scopeLine}
        </p>

        <span className="mt-auto flex items-center gap-2 pt-7 text-[11px] font-medium uppercase tracking-[0.18em] text-off-white/60 transition-colors duration-500 group-hover:text-gold">
          Read the case study
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </span>
      </Link>
    </motion.article>
  );
}
