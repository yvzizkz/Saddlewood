"use client";

/**
 * Homepage service sections, handoff composition: the Kitchen & Bath pair
 * on a cream interlude ("Built to the sixteenth.") and the Framing pair on
 * the dark ground ("Engineered, then self-performed."). Each pairs a
 * traced sheet with the real delivered photograph from that discipline.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import {
  revealVariants,
  revealStaticVariants,
  REVEAL_STEP,
  REVEAL_VIEWPORT,
} from "@/lib/reveal";
import { SheetPair } from "@/components/SheetPair";
import { VideoPanel } from "@/components/VideoPanel";
import { KitchenSheet, ShearWallSheet } from "@/components/linework";

export function KitchenPairSection() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const variants = prefersReducedMotion ? revealStaticVariants : revealVariants;

  return (
    <section
      className="night-on-cream relative bg-off-white py-[clamp(72px,9vh,112px)] text-charcoal"
      aria-label="Kitchen and bath"
    >
      <div className="night-cream-grid" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <span className="section-label !mb-0">Services · Kitchen &amp; Bath</span>
        <motion.h2
          variants={variants}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[18ch] font-heading text-[clamp(32px,4.4vw,54px)] font-medium leading-[1.12] tracking-[-0.02em] text-charcoal"
        >
          Built to the{" "}
          <em className="font-normal italic text-gold-display">sixteenth.</em>
        </motion.h2>
        <motion.p
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[54ch] text-[15.5px] leading-[1.8] text-charcoal-light"
        >
          Every kitchen starts as a dimensioned elevation and ends flush to
          it. Waterfall edges, custom millwork, stone specified to the
          profile. Drawing and delivery, side by side.
        </motion.p>

        <div className="mt-11">
          <SheetPair
            tone="cream"
            left={{
              tag: "Drawn",
              caption: "Traced from the project's millwork set",
              children: (
                <div className="linework-ink w-full p-4">
                  <KitchenSheet className="block h-auto w-full" />
                </div>
              ),
            }}
            right={{
              tag: "Troon · Remodel",
              caption: "Kitchen remodel underway · filmed on site",
              aspect: "min-h-[320px]",
              children: (
                <VideoPanel
                  src="/videos/saddlewood-reel-troon-kitchen-9x16.mp4"
                  poster="/videos/saddlewood-reel-troon-kitchen-9x16-poster.jpg"
                  label="Kitchen segment of the in-progress Troon remodel walkthrough"
                />
              ),
            }}
          />
        </div>

        <motion.div
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-10"
        >
          <Link
            href="/services"
            className="inline-flex items-center gap-2 border-b border-gold-accessible/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-accessible no-underline transition-colors hover:border-gold-accessible"
          >
            All services
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

export function FramingPairSection() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const variants = prefersReducedMotion ? revealStaticVariants : revealVariants;

  return (
    <section
      className="relative py-[clamp(72px,9vh,112px)]"
      aria-label="Framing"
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <span className="section-label !mb-0">Services · Framing</span>
        <motion.h2
          variants={variants}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[20ch] font-heading text-[clamp(32px,4.4vw,54px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white"
        >
          Engineered, then{" "}
          <em className="font-normal italic text-gold">self-performed.</em>
        </motion.h2>
        <motion.p
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[54ch] text-[15.5px] leading-[1.8] text-off-white/70"
        >
          Steel studs at 16 inches on center, shear panels screwed to
          schedule, holdowns where the plans call them. The crew that reads
          the S-sheets installs them.
        </motion.p>

        <div className="mt-11">
          <SheetPair
            tone="dark"
            left={{
              tag: "Drawn",
              caption: "Traced from the engineer's structural set",
              children: (
                <div className="w-full p-4">
                  <ShearWallSheet className="block h-auto w-full" />
                </div>
              ),
            }}
            right={{
              tag: "Installed",
              caption: "Structural phase · Paradise Valley · self-performed",
              aspect: "min-h-[320px]",
              children: (
                <VideoPanel
                  src="/videos/saddlewood-scaffold-loop.mp4"
                  poster="/videos/saddlewood-scaffold-loop-poster.jpg"
                  label="Slowed pass of scaffold work on the active Paradise Valley build"
                />
              ),
            }}
          />
        </div>

        <motion.div
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-10"
        >
          <Link
            href="/framing"
            className="inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold no-underline transition-colors hover:border-gold"
          >
            Framing for builders
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
