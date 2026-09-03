"use client";

/**
 * Architectural payoff band — the homepage transition between the
 * "How it gets built" sequence and the full scope ledger.
 *
 * Replaces the redundant crew video loop with the client-approved
 * architectural finish study: a cinematic Ken Burns drift of the
 * completed Paradise Valley estate at dusk.
 */

import Image from "next/image";
import { motion } from "framer-motion";
import { GrainOverlay } from "@/components/GrainOverlay";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

export function CrewCycle() {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <section
      className="relative h-[clamp(320px,50vh,540px)] overflow-hidden"
      aria-label="Where the build lands in Paradise Valley"
    >
      {/* The payoff: where the build lands. High-res architectural study with subtle cinematic Ken Burns push. */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={prefersReducedMotion ? { scale: 1 } : { scale: [1, 1.05] }}
          transition={{
            duration: 16,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
          }}
        >
          <Image
            src="/images/study-estate-facade-luxury.jpg"
            alt="Completed luxury modern estate in Paradise Valley at dusk"
            fill
            sizes="100vw"
            className="object-cover object-[50%_60%]"
          />
        </motion.div>
      </div>

      {/* Scrim: hold the obsidian ground at the edges so the band reads as part of the page */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(to bottom, rgba(13,21,21,0.85), rgba(13,21,21,0.30) 35%, rgba(13,21,21,0.30) 65%, rgba(13,21,21,0.88)), linear-gradient(rgba(13,21,21,0.15), rgba(13,21,21,0.15))",
        }}
      />
      <GrainOverlay />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] px-5 pb-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="[text-shadow:0_1px_14px_rgba(13,21,21,0.9)]">
            <span className="inline-flex items-center gap-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold max-[480px]:gap-2.5 max-[480px]:text-[9.5px] max-[480px]:tracking-[0.14em]">
              <span
                className="h-px w-8 shrink-0 bg-gold max-[480px]:w-5"
                aria-hidden="true"
              />
              Where it lands · Paradise Valley
            </span>
            <p className="mt-3 max-w-[24ch] font-heading text-[clamp(22px,2.6vw,34px)] font-medium leading-[1.2] tracking-[-0.01em] text-off-white">
              The same crew,{" "}
              <em className="font-normal italic text-gold">
                all the way to the finish.
              </em>
            </p>
          </div>

          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-off-white/[0.6]">
            Architectural Study · Estate in progress, Paradise Valley
          </span>
        </div>
      </div>
    </section>
  );
}
