"use client";

/**
 * Crew cycle band — the homepage's one long look at the crew at work
 * (owner note, 2026-08-28: "a polished animation that also shows a
 * construction crew completing the project, running in what looks like a
 * limitless loop but really isn't").
 *
 * The montage is cut with long cross-dissolves and no hard cuts, so it reads
 * as continuous work with no seam to count. It is finite: one pass, then it
 * hands off to the client-approved rendering of the finished estate, which
 * is where the same build is going. Same grammar as the hero, which also
 * lands on a still and rests there.
 *
 * The footage and the rendering never blend into one another off-screen: the
 * rendering is a separate layer with its own caption, so nothing generated
 * or unbuilt is ever presented as filmed work.
 */

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { VideoPanel } from "@/components/VideoPanel";
import { GrainOverlay } from "@/components/GrainOverlay";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

const EASE = [0.22, 1, 0.36, 1] as const;

export function CrewCycle() {
  const [settled, setSettled] = useState(false);
  // Reduced motion holds the poster frame, so the pass never rests and the
  // closing line would never arrive. It is true over the footage too, so
  // show it outright. The rendering layer stays hidden: nothing generated
  // appears without the transition that introduces it.
  const prefersReducedMotion = usePrefersReducedMotion();
  const showClosingLine = settled || prefersReducedMotion;

  return (
    <section
      className="relative h-[clamp(320px,54vh,560px)] overflow-hidden"
      aria-label="The crew at work on the active Paradise Valley build"
    >
      <VideoPanel
        src="/videos/saddlewood-crew-cycle.mp4"
        poster="/videos/saddlewood-crew-cycle-poster.jpg"
        label="Continuous pass of the Saddlewood crew working the active Paradise Valley steel build"
        preload="auto"
        replay
        replayClassName="right-5 top-5 sm:right-8"
        restLead={1.4}
        onRest={() => setSettled(true)}
        onReplay={() => setSettled(false)}
      />

      {/* The payoff: where the same build lands. Held behind the footage
          until the pass finishes, then resolved with a slow push. */}
      <motion.div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden={!settled}
        initial={false}
        animate={{ opacity: settled ? 1 : 0 }}
        transition={{ duration: 1.6, ease: EASE }}
      >
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ scale: settled ? 1 : 1.1 }}
          transition={{ duration: 7, ease: EASE }}
        >
          <Image
            src="/images/vision-entry.jpg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        </motion.div>
      </motion.div>

      {/* Scrim: hold the night ground at the edges so the band reads as part
          of the page, not a break in it. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(to bottom, rgba(26,47,47,0.82), rgba(26,47,47,0.25) 35%, rgba(26,47,47,0.25) 65%, rgba(26,47,47,0.86)), linear-gradient(rgba(26,47,47,0.15), rgba(26,47,47,0.15))",
        }}
      />
      <GrainOverlay />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] px-5 pb-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="[text-shadow:0_1px_14px_rgba(26,47,47,0.8)]">
            <span className="inline-flex items-center gap-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold max-[480px]:gap-2.5 max-[480px]:text-[9.5px] max-[480px]:tracking-[0.14em]">
              <span
                className="h-px w-8 shrink-0 bg-gold max-[480px]:w-5"
                aria-hidden="true"
              />
              {settled
                ? "Where it lands · Paradise Valley"
                : "Filmed on site · Paradise Valley"}
            </span>
            <motion.p
              className="mt-3 max-w-[24ch] font-heading text-[clamp(20px,2.4vw,30px)] font-medium leading-[1.2] tracking-[-0.01em] text-off-white"
              initial={false}
              animate={{
                opacity: showClosingLine ? 1 : 0,
                y: showClosingLine ? 0 : 8,
              }}
              transition={{ duration: 1.1, ease: EASE, delay: settled ? 0.5 : 0 }}
            >
              The same crew,{" "}
              <em className="font-normal italic text-gold">
                all the way to the finish.
              </em>
            </motion.p>
          </div>

          <motion.span
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-off-white/[0.55]"
            initial={false}
            animate={{ opacity: settled ? 1 : 0 }}
            transition={{ duration: 1.1, ease: EASE }}
          >
            Rendering · Estate in progress, Paradise Valley
          </motion.span>
        </div>
      </div>
    </section>
  );
}
