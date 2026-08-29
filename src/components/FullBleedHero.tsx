"use client";

/**
 * Full-bleed subpage hero — the premium-standard treatment applied per the
 * page map: edge-to-edge media (single-pass video or graded still, optional
 * slow Ken Burns) under the dark grade and 5% grain, mono eyebrow +
 * Fraunces title bottom-left with a text shadow, optional truth chip and
 * media caption. Renders must pass a mediaCaption beginning "Rendering".
 * Reduced motion: video shows its poster, Ken Burns stays still.
 */

import type { ReactNode } from "react";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { VideoPanel } from "@/components/VideoPanel";
import { GrainOverlay } from "@/components/GrainOverlay";

const EASE = [0.22, 1, 0.36, 1] as const;

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.25, staggerChildren: 0.16 } },
};

const fadeUpVariants: Variants = {
  hidden: { opacity: 0.12, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

export type FullBleedHeroMedia =
  | { kind: "video"; src: string; poster: string }
  | {
      kind: "image";
      src: string;
      alt: string;
      kenBurns?: boolean;
      /** Tailwind object-position class, e.g. "object-[50%_35%]" — used to
          keep a portrait source's subject (or crop a baked caption) in frame. */
      positionClass?: string;
    };

interface FullBleedHeroProps {
  media: FullBleedHeroMedia;
  /** Accessible description of the media. */
  label: string;
  /** Truth chip, top-left under the nav. live=true adds the pulsing dot. */
  chip?: { text: string; live?: boolean };
  eyebrow: string;
  title: ReactNode;
  description?: string;
  /** Mono caption pinned bottom-right (e.g. "Rendering · Estate in progress"). */
  mediaCaption?: string;
  /**
   * Decorative layer between the grade and the copy — e.g. the brand roundel
   * resolving over a dusk plate. Rendered aria-hidden and non-interactive, so
   * it never competes with the headline for the pointer or the screen reader.
   */
  overlay?: ReactNode;
  /** Extra content under the description (CTAs, links). */
  children?: ReactNode;
  /** Height utility, default min-h-[74svh]. */
  minHeightClass?: string;
}

export function FullBleedHero({
  media,
  label,
  chip,
  eyebrow,
  title,
  description,
  mediaCaption,
  overlay,
  children,
  minHeightClass = "min-h-[74svh]",
}: FullBleedHeroProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";

  return (
    <section
      className={`relative flex ${minHeightClass} flex-col justify-end overflow-hidden`}
      role="banner"
      aria-label={label}
    >
      {media.kind === "video" ? (
        <VideoPanel
          src={media.src}
          poster={media.poster}
          label={label}
          className="absolute inset-0 h-full w-full scale-[1.02] object-cover"
          preload="auto"
          replay
        />
      ) : (
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src={media.src}
            alt={media.alt}
            fill
            priority
            sizes="100vw"
            className={`object-cover ${media.positionClass ?? ""} ${
              media.kenBurns && !prefersReducedMotion ? "kenburns" : "scale-[1.02]"
            }`}
          />
        </div>
      )}

      {/* Grade — same raised curve as the homepage hero */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(to top, rgba(26,47,47,0.94) 0%, rgba(26,47,47,0.72) 42%, rgba(26,47,47,0.5) 68%, rgba(26,47,47,0.26) 84%, rgba(26,47,47,0.5) 100%)",
        }}
      />
      <GrainOverlay />

      {overlay ? (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {overlay}
        </div>
      ) : null}

      {chip ? (
        <span className="night-reel-chip !left-5 !top-[106px] sm:!left-10">
          {chip.live ? <i className="night-live-dot" aria-hidden="true" /> : null}
          {chip.text}
        </span>
      ) : null}

      {mediaCaption ? (
        <span className="absolute bottom-5 right-5 z-[1] font-mono text-[10px] uppercase tracking-[0.16em] text-off-white/[0.55] sm:right-8">
          {mediaCaption}
        </span>
      ) : null}

      <motion.div
        className="relative z-[1] mx-auto w-full max-w-[1240px] px-5 pb-[clamp(40px,6vh,64px)] pt-40 [text-shadow:0_1px_14px_rgba(26,47,47,0.8)] sm:px-8"
        variants={containerVariants}
        initial={initial}
        animate="visible"
      >
        <motion.span
          variants={fadeUpVariants}
          className="inline-flex items-center gap-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold max-[480px]:gap-2.5 max-[480px]:text-[9.5px] max-[480px]:tracking-[0.16em]"
        >
          <span className="h-px w-8 shrink-0 bg-gold max-[480px]:w-5" aria-hidden="true" />
          {eyebrow}
        </motion.span>

        <motion.h1
          variants={fadeUpVariants}
          className="mt-5 max-w-[18ch] font-heading text-4xl font-medium leading-[1.08] tracking-[-0.02em] text-off-white sm:text-5xl lg:text-6xl"
        >
          {title}
        </motion.h1>

        {description ? (
          <motion.p
            variants={fadeUpVariants}
            className="mt-6 max-w-[560px] text-[15.5px] leading-[1.8] text-off-white/[0.78]"
          >
            {description}
          </motion.p>
        ) : null}

        {children ? (
          <motion.div variants={fadeUpVariants} className="mt-8">
            {children}
          </motion.div>
        ) : null}
      </motion.div>
    </section>
  );
}
