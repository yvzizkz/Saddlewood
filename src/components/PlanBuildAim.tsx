"use client";

/**
 * "The plan. The build. The aim." — one build in three moments: the traced
 * plan, the steel frame going up, and the client-approved rendering of
 * where it lands. Proof the drawings, the job site, and the finished
 * vision are one continuous piece of work by one crew.
 *
 * Content rules honored here: the render is the rear terrace with the
 * address banner cropped; no street addresses or owner names anywhere.
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
import { PhotoWipe } from "@/components/PhotoWipe";
import { PlanSketch } from "@/components/linework";

interface Beat {
  tag: string;
  heading: string;
  caption: string;
  media: React.ReactNode;
}

export function PlanBuildAim() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const variants = prefersReducedMotion ? revealStaticVariants : revealVariants;

  const beats: Beat[] = [
    {
      tag: "01 · The plan",
      heading: "Drawn",
      caption:
        "Traced from the project's working set. Every page carries its own vignette from a real sheet.",
      media: (
        <div className="linework-ink flex h-full w-full items-center justify-center bg-[#faf6ea] p-4">
          <PlanSketch className="block h-full w-full" />
        </div>
      ),
    },
    {
      tag: "02 · The build",
      heading: "Framing now",
      caption:
        "Structural steel phase underway, self-performed. The reel above is this site.",
      media: (
        <PhotoWipe
          src="/images/steel-built.jpg"
          alt="Steel framing underway on site"
        />
      ),
    },
    {
      tag: "03 · The aim",
      heading: "Where it lands",
      caption:
        "The client-approved rendering of the finished estate. Address and owner details stay off the site.",
      media: (
        <PhotoWipe
          src="/images/render-rear.jpg"
          alt="Rendering of the finished estate's rear terrace"
        />
      ),
    },
  ];

  return (
    <section
      className="relative py-[clamp(90px,11vh,140px)]"
      aria-label="One build, start to finish"
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <span className="section-label !mb-0">One Build, Start to Finish</span>
        <motion.h2
          variants={variants}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[20ch] font-heading text-[clamp(32px,4.4vw,54px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white"
        >
          The plan. The build. The{" "}
          <em className="font-normal italic text-gold">aim.</em>
        </motion.h2>
        <motion.p
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-6 max-w-[54ch] text-[15.5px] leading-[1.8] text-off-white/70"
        >
          Same estate, three moments. Proof the drawings, the job site, and
          the finished vision are one continuous piece of work by one crew.
        </motion.p>

        <div className="mt-11 grid grid-cols-1 gap-5 md:grid-cols-3">
          {beats.map((beat, i) => (
            <motion.div
              key={beat.tag}
              variants={variants}
              custom={REVEAL_STEP * i}
              initial="hidden"
              whileInView="visible"
              viewport={REVEAL_VIEWPORT}
              className="flex flex-col border border-gold/[0.28] bg-teal"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-teal-dark">
                <span className="absolute left-3 top-3 z-[2] border border-gold/[0.35] bg-teal-dark/80 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-gold">
                  {beat.tag}
                </span>
                {beat.media}
              </div>
              <div className="px-[18px] pb-[18px] pt-4">
                <div className="font-heading text-[18px] font-medium text-off-white">
                  {beat.heading}
                </div>
                <p className="mt-1 text-[13.5px] leading-[1.6] text-off-white/[0.62]">
                  {beat.caption}
                </p>
              </div>
            </motion.div>
          ))}
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
            href="/portfolio"
            className="inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold no-underline transition-colors hover:border-gold"
          >
            View the case studies
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
