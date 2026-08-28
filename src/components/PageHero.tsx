"use client";

/**
 * Shared subpage hero, Night Blueprint v2 — dark page ground (the marketing
 * shell's teal-dark + blueprint grid show through), gold kicker, Fraunces
 * display title, optional intro copy, and an optional linework slot for a
 * self-drawing figure. No photography.
 */

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

interface PageHeroProps {
  label: string;
  title: string;
  description?: string;
  /** Optional self-drawing linework figure, rendered beside the copy at lg+. */
  linework?: ReactNode;
  /**
   * @deprecated v2 renders no hero photography — accepted as a no-op so
   * unmigrated pages compile. TODO(phase-4): remove image/imageAlt once
   * every page passes `linework` instead.
   */
  image?: string;
  /** @deprecated See `image`. */
  imageAlt?: string;
}

export function PageHero({ label, title, description, linework }: PageHeroProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      className="relative flex items-end overflow-hidden pb-[clamp(48px,7vh,80px)] pt-32 sm:pt-36 lg:pt-40"
      role="banner"
    >
      {/* Ambient gold glow */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 30% 80%, rgba(200,165,90,0.08), transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid w-full max-w-[1240px] items-end gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
        >
          <span className="section-label !mb-0">{label}</span>
          <h1 className="mt-5 max-w-[16ch] font-heading text-4xl font-medium leading-[1.08] tracking-[-0.02em] text-off-white sm:text-5xl lg:text-6xl xl:text-[68px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-6 max-w-[560px] text-[15.5px] leading-[1.8] text-off-white/70">
              {description}
            </p>
          ) : null}
        </motion.div>

        {linework ? (
          <div className="hidden lg:block" aria-hidden="true">
            {linework}
          </div>
        ) : null}
      </div>
    </section>
  );
}
