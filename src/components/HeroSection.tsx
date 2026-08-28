"use client";

/**
 * Night Blueprint hero — no photography. Full-viewport teal-dark ground,
 * gold kicker with flanking rules, Fraunces display H1 (mask-reveal
 * stagger), real sub-copy, CTA pair, and the EstateElevation drawing
 * itself in glowing gold linework along the bottom edge.
 */

import { motion, useReducedMotion, type Variants } from "framer-motion";
import Link from "next/link";
import { Phone } from "lucide-react";
import { EstateElevation } from "@/components/linework";

// ease-out cubic — cinematic settle, fast start, soft landing
const EASE = [0.22, 1, 0.36, 1] as const;

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.4,
      staggerChildren: 0.2,
    },
  },
};

// Mask reveal: text rises from below an overflow-hidden frame
const maskLineVariants: Variants = {
  hidden: { y: "115%" },
  visible: {
    y: 0,
    transition: { duration: 1.05, ease: EASE },
  },
};

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: EASE },
  },
};

const accentVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 1.4, ease: EASE, delay: 0.15 },
  },
};

export function HeroSection() {
  const prefersReducedMotion = useReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";

  return (
    <section
      className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden"
      aria-label="Saddlewood Contracting"
    >
      {/* Ambient gold glow rising behind the elevation */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 70% 52% at 50% 66%, rgba(200,165,90,0.10), transparent 68%)",
        }}
      />

      {/* Copy — centered, mask-reveal stagger */}
      <motion.div
        className="relative z-[1] mx-auto w-full max-w-[1240px] px-5 pt-32 text-center sm:px-8 sm:pt-36"
        variants={containerVariants}
        initial={initial}
        animate="visible"
      >
        <motion.span
          variants={fadeUpVariants}
          className="inline-flex items-center gap-3.5 text-[11px] font-medium uppercase tracking-[0.25em] text-gold"
        >
          <span className="h-px w-6 bg-gold" aria-hidden="true" />
          Luxury Residential · Scottsdale, Arizona
          <span className="h-px w-6 bg-gold" aria-hidden="true" />
        </motion.span>

        <h1 className="night-hero-title mx-auto mt-7 font-heading font-medium text-off-white">
          <span className="block overflow-hidden pb-1">
            <motion.span variants={maskLineVariants} className="block">
              Built for Homes
            </motion.span>
          </span>
          <span className="block overflow-hidden pb-1">
            <motion.span
              variants={maskLineVariants}
              className="block whitespace-nowrap"
            >
              That Demand{" "}
              <motion.em
                variants={accentVariants}
                className="font-normal italic text-gold"
              >
                More.
              </motion.em>
            </motion.span>
          </span>
        </h1>

        <motion.p
          variants={fadeUpVariants}
          className="mx-auto mt-8 max-w-[560px] text-base leading-[1.75] text-off-white/70"
        >
          New construction, whole-home remodels, and framing in structural
          steel and conventional lumber. One point of contact, every trade
          handled <span className="whitespace-nowrap">in-house</span> from demo
          to final&nbsp;detail.
        </motion.p>

        <motion.div
          variants={fadeUpVariants}
          className="mt-11 flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            href="/contact"
            className="inline-block rounded-[2px] bg-gold px-[34px] py-[15px] text-[12px] font-semibold uppercase tracking-[0.1em] text-teal-dark no-underline transition-all hover:-translate-y-px hover:bg-[#d4a94c] hover:shadow-[0_10px_34px_rgba(200,165,90,0.28)]"
          >
            Book Your Consultation
          </Link>
          <a
            href="tel:4809996100"
            className="inline-flex items-center gap-2 rounded-[2px] border border-off-white/25 px-[26px] py-[14px] text-[13px] tracking-[0.06em] text-off-white/80 no-underline transition-colors hover:border-gold hover:text-gold"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            (480) 999-6100
          </a>
        </motion.div>
      </motion.div>

      {/* Estate elevation — draws itself along the bottom edge */}
      <div className="relative mt-[clamp(24px,4vh,56px)] w-full" aria-hidden="true">
        <EstateElevation className="block h-[clamp(240px,40vh,540px)] w-full" glow />
      </div>
    </section>
  );
}
