"use client";

/**
 * About hero — the crew-lead plate, held at a size it can actually fill.
 *
 * Owner note, 2026-08-28: the hero "looks great but is a bit grainy". The
 * plate was never an upscale on disk; the softness came from the layout.
 * The source frame is 1080px wide, and a full-bleed hero asked it to cover
 * 1440 CSS px (nearly 2900 device px on a retina screen), so the browser was
 * enlarging it by 2.7x. Nothing in the file could fix that.
 *
 * So the frame now runs twice: once as an out-of-focus ground, where
 * resolution is irrelevant, and once as a bordered plate about 545px wide,
 * where the source is downscaled rather than stretched and reads sharp. The
 * page keeps its edge-to-edge hero; the subject stops being enlarged.
 *
 * The plate is also cropped above the reel's burned-in social caption, so no
 * viewport can bring "POV / YOU NEVER SEEN A HOUSE BUILT LIKE THIS" back
 * into an About page hero.
 */

import type { ReactNode } from "react";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { GrainOverlay } from "@/components/GrainOverlay";

const EASE = [0.22, 1, 0.36, 1] as const;

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.25, staggerChildren: 0.16 } },
};

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const PLATE = "/images/about-lead-framing.jpg";
const PLATE_ALT =
  "A Saddlewood team lead standing in the structural framing of the active Paradise Valley build";

interface AboutHeroProps {
  children?: ReactNode;
}

export function AboutHero({ children }: AboutHeroProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";

  return (
    <section
      className="relative flex min-h-[74svh] flex-col justify-end overflow-hidden"
      role="banner"
      aria-label="Saddlewood crew on the active Paradise Valley build"
    >
      {/* Out-of-focus ground: the same frame, where softness is the point. */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <Image
          src={PLATE}
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-[1.12] object-cover object-[50%_38%] blur-[22px]"
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(to top, rgba(13,21,21,0.96) 0%, rgba(13,21,21,0.78) 42%, rgba(13,21,21,0.6) 68%, rgba(13,21,21,0.42) 84%, rgba(13,21,21,0.62) 100%)",
        }}
      />
      <GrainOverlay />

      <motion.div
        className="relative z-[1] mx-auto grid w-full max-w-[1240px] items-end gap-x-[clamp(32px,5vw,72px)] gap-y-10 px-5 pb-[clamp(40px,6vh,64px)] pt-36 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]"
        variants={containerVariants}
        initial={initial}
        animate="visible"
      >
        <div className="[text-shadow:0_1px_14px_rgba(13,21,21,0.9)]">
          <motion.div
            variants={fadeUpVariants}
            className="mb-7 w-[105px] sm:w-[130px] md:w-[150px] [filter:drop-shadow(0_4px_24px_rgba(13,21,21,0.75))]"
          >
            <Image
              src="/images/logo-roundel-white.png"
              alt="Saddlewood Contracting"
              width={300}
              height={300}
              className="h-auto w-full object-contain"
              priority
            />
          </motion.div>

          <motion.span
            variants={fadeUpVariants}
            className="inline-flex items-center gap-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold max-[480px]:gap-2.5 max-[480px]:text-[9.5px] max-[480px]:tracking-[0.16em]"
          >
            <span
              className="h-px w-8 shrink-0 bg-gold max-[480px]:w-5"
              aria-hidden="true"
            />
            About Saddlewood
          </motion.span>

          <motion.h1
            variants={fadeUpVariants}
            className="mt-5 max-w-[18ch] font-heading text-4xl font-medium leading-[1.08] tracking-[-0.02em] text-off-white sm:text-5xl lg:text-6xl"
          >
            Our <em className="font-normal italic text-gold">Story</em>
          </motion.h1>

          <motion.p
            variants={fadeUpVariants}
            className="mt-6 max-w-[520px] text-[15.5px] leading-[1.8] text-off-white/[0.78]"
          >
            Built on a foundation of integrity, quality, and a deep love for
            transforming Scottsdale homes.
          </motion.p>

          {children ? (
            <motion.div variants={fadeUpVariants} className="mt-8">
              {children}
            </motion.div>
          ) : null}
        </div>

        {/* The sharp plate: rendered at roughly half the source width, so the
            browser downsamples instead of enlarging. */}
        <motion.figure
          variants={fadeUpVariants}
          className="m-0 w-full max-w-[520px] justify-self-start lg:justify-self-end"
        >
          <div className="relative aspect-[1080/1070] overflow-hidden border border-gold/[0.28] bg-teal">
            <Image
              src={PLATE}
              alt={PLATE_ALT}
              fill
              priority
              sizes="(max-width: 1024px) 92vw, 520px"
              className="object-cover"
            />
          </div>
          <figcaption className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-off-white/[0.55]">
            Filmed on site · Paradise Valley
          </figcaption>
        </motion.figure>
      </motion.div>
    </section>
  );
}
