"use client";

/**
 * The drawing becomes the build (owner direction, 2026-08-28): a pinned
 * scroll sequence. The perspective trace of the entry rendering draws
 * itself on paper; as the visitor scrolls, the building materializes from
 * the ground up behind a travelling gold level line while the strokes
 * ghost away, and the slogan lands as the picture completes. The trace is
 * aligned 1:1 with the rendering so it reads as a transformation, not a
 * crossfade. Reduced motion (and no-JS-first paint) shows the completed
 * composite with ghosted linework.
 */

import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform, type MotionStyle } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { VisionTrace } from "@/components/linework/VisionTrace";

function Frame({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full overflow-hidden border border-stone-mid bg-[#faf6ea]">
      <div className="relative aspect-[1600/902] max-h-[78svh] w-full">{children}</div>
    </div>
  );
}

function Chips() {
  return (
    <>
      <span className="absolute right-3.5 top-3.5 z-[4] border border-stone-mid bg-off-white/90 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-gold-accessible">
        Drawn
      </span>
      <span className="absolute bottom-3.5 right-3.5 z-[4] border border-gold/[0.35] bg-teal-dark/80 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-gold">
        Rendering · Estate in progress, Paradise Valley
      </span>
    </>
  );
}

function Slogan({ style }: { style?: MotionStyle }) {
  return (
    <motion.div
      style={style}
      className="absolute bottom-6 left-5 z-[4] border border-stone-mid bg-off-white/[0.92] px-6 py-4 backdrop-blur-[3px] sm:left-8"
    >
      <p className="font-heading text-[clamp(20px,2.4vw,30px)] font-medium leading-[1.2] tracking-[-0.01em] text-charcoal">
        Drawn first.{" "}
        <em className="font-normal italic text-gold-display">Then built.</em>
      </p>
    </motion.div>
  );
}

export function VisionTransform() {
  const outerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const { scrollYProgress } = useScroll({
    target: outerRef,
    offset: ["start start", "end end"],
  });

  // Ground-up reveal: inset's top edge falls 100% -> 0% as you scroll.
  const clipTop = useTransform(scrollYProgress, [0.14, 0.78], [100, 0]);
  const clipPath = useTransform(clipTop, (v) => `inset(${v}% 0% 0% 0%)`);
  // The gold level line rides the reveal front.
  const levelTop = useTransform(clipTop, (v) => `${v}%`);
  const levelOpacity = useTransform(
    scrollYProgress,
    [0.1, 0.16, 0.76, 0.84],
    [0, 1, 1, 0]
  );
  // Strokes ghost as the build completes; slogan lands last.
  const traceOpacity = useTransform(scrollYProgress, [0.5, 0.88], [1, 0.14]);
  const sloganOpacity = useTransform(scrollYProgress, [0.82, 0.94], [0, 1]);
  const sloganY = useTransform(scrollYProgress, [0.82, 0.94], [14, 0]);

  if (prefersReducedMotion) {
    // Static end state: the build complete, linework ghosted, slogan set.
    return (
      <div className="mt-11">
        <Frame>
          <Image
            src="/images/vision-entry.jpg"
            alt="Rendering of the entry courtyard of the estate in progress in Paradise Valley"
            fill
            sizes="(max-width: 1280px) 100vw, 1240px"
            className="object-cover"
          />
          <div className="pointer-events-none absolute inset-0 opacity-[0.14]">
            <VisionTrace className="block h-full w-full" />
          </div>
          <Slogan />
          <Chips />
        </Frame>
      </div>
    );
  }

  return (
    <div ref={outerRef} className="relative mt-11 h-[260svh]">
      <div className="sticky top-0 flex h-svh items-center">
        <Frame>
          {/* Paper grid under everything */}
          <div className="night-cream-grid" aria-hidden="true" />

          {/* The building, materializing ground-up */}
          <motion.div className="absolute inset-0" style={{ clipPath }}>
            <Image
              src="/images/vision-entry.jpg"
              alt="Rendering of the entry courtyard of the estate in progress in Paradise Valley"
              fill
              sizes="(max-width: 1280px) 100vw, 1240px"
              className="object-cover"
            />
          </motion.div>

          {/* Gold level line at the reveal front */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-x-0 z-[3] h-[2px] bg-gold shadow-[0_0_18px_rgba(200,165,90,0.7)]"
            style={{ top: levelTop, opacity: levelOpacity }}
          >
            <span className="absolute -top-[5px] left-4 h-3 w-px bg-gold" />
            <span className="absolute -top-[5px] right-4 h-3 w-px bg-gold" />
          </motion.div>

          {/* The trace: draws on arrival, ghosts as the build completes */}
          <motion.div
            className="linework-ink pointer-events-none absolute inset-0 z-[2]"
            style={{ opacity: traceOpacity }}
          >
            <VisionTrace className="block h-full w-full" />
          </motion.div>

          <Slogan style={{ opacity: sloganOpacity, y: sloganY }} />
          <Chips />
        </Frame>
      </div>
    </div>
  );
}
