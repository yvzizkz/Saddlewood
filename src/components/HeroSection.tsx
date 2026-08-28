"use client";

/**
 * Night Blueprint hero, handoff composition (2026-08-28): copy column on
 * the left, the live job-site reel card on the right. The reel is the
 * active Paradise Valley steel build — the "On site now" chip must stay
 * true; when this build wraps, swap the loop for the next active project.
 * The reel card drifts subtly on scroll (max 24px, off under reduced
 * motion). Fraunces mask-reveal H1 carries over from the previous hero.
 */

import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import Link from "next/link";
import { Phone } from "lucide-react";
import { VideoReel } from "@/components/VideoReel";

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
  hidden: { opacity: 0.12, y: 14 },
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

const reelVariants: Variants = {
  hidden: { opacity: 0.12, y: 26 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: EASE, delay: 0.5 },
  },
};

export function HeroSection() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";

  // Hero parallax: the reel card drifts down as the page scrolls away,
  // capped at 24px (handoff spec: translateY(min(scrollY/30, 24))).
  const { scrollY } = useScroll();
  const parallaxY = useTransform(scrollY, [0, 720], [0, 24]);

  return (
    <section
      className="relative overflow-hidden"
      aria-label="Saddlewood Contracting"
    >
      {/* Ambient gold glow behind the reel column */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 72% 55%, rgba(200,165,90,0.10), transparent 68%)",
        }}
      />

      <div className="relative z-[1] mx-auto grid w-full max-w-[1240px] items-center gap-[clamp(40px,6vw,72px)] px-5 pb-[clamp(64px,9vh,110px)] pt-[clamp(120px,16vh,168px)] sm:px-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        {/* Copy column */}
        <motion.div variants={containerVariants} initial={initial} animate="visible">
          <motion.span
            variants={fadeUpVariants}
            className="inline-flex items-center gap-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold"
          >
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            Now Framing · Paradise Valley
          </motion.span>

          <h1 className="night-hero-title mt-7 font-heading font-medium text-off-white">
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
            className="mt-8 max-w-[560px] text-base leading-[1.75] text-off-white/70"
          >
            New construction, whole-home remodels, and framing in structural
            steel and conventional lumber. One point of contact, every trade
            handled <span className="whitespace-nowrap">in-house</span> from demo
            to final&nbsp;detail.
          </motion.p>

          <motion.div
            variants={fadeUpVariants}
            className="mt-11 flex flex-wrap items-center gap-4"
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

        {/* Reel card — live footage of the active steel build */}
        <motion.div
          variants={reelVariants}
          initial={initial}
          animate="visible"
          style={prefersReducedMotion ? undefined : { y: parallaxY }}
          className="relative w-[min(340px,86vw)] justify-self-start lg:justify-self-end"
        >
          <span className="reel-corner reel-corner--tl" aria-hidden="true" />
          <span className="reel-corner reel-corner--br" aria-hidden="true" />
          <div className="night-reel">
            <VideoReel
              src="/videos/saddlewood-hero-loop.mp4"
              poster="/videos/saddlewood-hero-loop-poster.jpg"
              label="Steel framing underway on the active Paradise Valley build"
              aspect="9x16"
              mode="autoloop"
              preload="metadata"
              className="rounded-none bg-teal-dark"
            />
            <span className="night-reel-chip">
              <i className="night-live-dot" aria-hidden="true" />
              On site now
            </span>
            <span className="night-reel-label">
              Structural phase · Filmed this build
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
