"use client";

/**
 * Hero V3 (2026-08-28): the reel IS the hero, and it lands on the mark.
 * Full-bleed footage of the active Paradise Valley steel build — re-cut
 * from the 1080p master (the earlier wide crop was an upscale, which is
 * what read as grain) so its last shot is a crew lead walking out through
 * the framing with the SC roundel on his back. Over that tail the frame
 * dissolves into the desert at dusk and the roundel resolves out of the
 * embroidered one: a match cut from the logo on the shirt to the logo on
 * the landscape. Copy bottom-left, stats row inside the hero, "On site
 * now" chip retiring with the footage it describes.
 *
 * Reduced motion shows the poster frame and skips the finale.
 */

import { useState } from "react";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import Link from "next/link";
import { Phone } from "lucide-react";
import { VideoPanel } from "@/components/VideoPanel";
import { CountUp } from "@/components/CountUp";
import { GrainOverlay } from "@/components/GrainOverlay";

// ease-out cubic — cinematic settle, fast start, soft landing
const EASE = [0.22, 1, 0.36, 1] as const;

const stats = [
  { number: 4, label: "Active ROC Licenses" },
  { number: 8, label: "Premier Neighborhoods" },
  { number: 1, label: "Point of Contact" },
];

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.4,
      staggerChildren: 0.18,
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
    transition: { duration: 0.7, ease: EASE },
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
  const prefersReducedMotion = usePrefersReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";
  // True once the footage hands over to the closing plate.
  const [settled, setSettled] = useState(false);

  return (
    <section
      className="relative flex min-h-[92svh] flex-col justify-end overflow-hidden"
      aria-label="Saddlewood Contracting"
    >
      {/* Full-bleed graded footage */}
      <VideoPanel
        src="/videos/saddlewood-hero-loop-wide.mp4"
        poster="/videos/saddlewood-hero-loop-wide-poster.jpg"
        label="Steel framing underway on the active Paradise Valley build"
        className="absolute inset-0 h-full w-full scale-[1.02] object-cover"
        // One slow pass on arrival, then the hero rests on the closing
        // plate — the page settles instead of churning behind the copy.
        preload="auto"
        replay
        restLead={1.5}
        onRest={() => setSettled(true)}
        onReplay={() => setSettled(false)}
      />

      {/* Closing plate: the desert at dusk, dissolving up through the tail
          of the footage. Camera keeps descending as it arrives. */}
      <motion.div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden={!settled}
        initial={false}
        animate={{ opacity: settled ? 1 : 0 }}
        transition={{ duration: 1.5, ease: EASE }}
      >
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ scale: settled ? 1 : 1.14 }}
          transition={{ duration: 6, ease: EASE }}
        >
          <Image
            src="/images/hero-finale-dusk.jpg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        </motion.div>

        {/* The mark, resolving out of the one embroidered on his back.
            Desktop has clear sky to the right of the headline; on phones
            the copy fills the frame, so it sits behind the text as a
            watermark instead of fighting it. */}
        <div className="absolute left-[62%] top-[46%] w-[46%] opacity-40 sm:left-[74%] sm:top-[41%] sm:w-[22%] sm:opacity-100">
          <motion.div
            className="[filter:drop-shadow(0_2px_18px_rgba(26,47,47,0.5))]"
            initial={false}
            animate={
              settled
                ? { opacity: 0.94, scale: 1, x: "-50%", y: "-50%" }
                : { opacity: 0, scale: 0.7, x: "-95%", y: "-18%" }
            }
            transition={{
              duration: 2.6,
              ease: EASE,
              opacity: { duration: 1.6, ease: EASE },
            }}
          >
            <Image
              src="/images/logo-roundel-white.png"
              alt=""
              width={300}
              height={300}
              className="h-auto w-full"
            />
          </motion.div>
        </div>
      </motion.div>

      {/* Grade: hold the copy zone dark, let the footage breathe up top.
          Stronger than the demo's curve because our copy block runs taller
          (sub + CTAs + stats), so legibility must hold to ~55% height. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(to top, rgba(26,47,47,0.94) 0%, rgba(26,47,47,0.72) 42%, rgba(26,47,47,0.5) 68%, rgba(26,47,47,0.26) 84%, rgba(26,47,47,0.5) 100%)",
        }}
      />

      {/* 5% film grain */}
      <GrainOverlay />

      {/* Live chip — must stay true, so it retires with the footage it
          describes rather than sitting over the closing plate */}
      <motion.span
        className="night-reel-chip !left-5 !top-[106px] sm:!left-10"
        initial={false}
        animate={{ opacity: settled ? 0 : 1 }}
        transition={{ duration: 1.1, ease: EASE }}
      >
        <i className="night-live-dot" aria-hidden="true" />
        On site now · Paradise Valley
      </motion.span>

      {/* The plate is a dusk study of the Scottsdale foothills, not a
          project photograph — it says so once it is on screen. */}
      <motion.span
        className="pointer-events-none absolute bottom-5 right-5 z-[1] font-mono text-[10px] uppercase tracking-[0.16em] text-off-white/[0.5] sm:right-8"
        initial={false}
        animate={{ opacity: settled ? 1 : 0 }}
        transition={{ duration: 1.4, ease: EASE, delay: settled ? 0.8 : 0 }}
      >
        Dusk study · Scottsdale foothills
      </motion.span>

      {/* Copy — bottom-left over the grade */}
      <motion.div
        className="relative z-[1] mx-auto w-full max-w-[1240px] px-5 pb-[clamp(44px,7vh,72px)] pt-40 [text-shadow:0_1px_14px_rgba(26,47,47,0.8)] max-lg:pb-28 sm:px-8"
        variants={containerVariants}
        initial={initial}
        animate="visible"
      >
        <motion.span
          variants={fadeUpVariants}
          className="inline-flex items-center gap-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold max-[480px]:gap-2.5 max-[480px]:text-[9.5px] max-[480px]:tracking-[0.16em]"
        >
          <span className="h-px w-8 shrink-0 bg-gold max-[480px]:w-5" aria-hidden="true" />
          Luxury Residential · Scottsdale, Arizona
        </motion.span>

        <h1 className="night-hero-title mt-6 font-heading font-medium text-off-white">
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
          className="mt-6 max-w-[52ch] text-[17px] leading-[1.7] text-off-white/[0.78]"
        >
          New construction, whole-home remodels, and steel framing. One point
          of contact, every trade handled{" "}
          <span className="whitespace-nowrap">in-house</span> from demo to
          final&nbsp;detail.
        </motion.p>

        <motion.div
          variants={fadeUpVariants}
          className="mt-8 flex flex-wrap items-center gap-4"
        >
          <Link
            href="/contact"
            className="inline-block rounded-[2px] bg-gold px-[34px] py-[15px] text-[12px] font-semibold uppercase tracking-[0.1em] text-teal-dark no-underline transition-all hover:-translate-y-px hover:bg-[#d4a94c] hover:shadow-[0_10px_34px_rgba(200,165,90,0.28)]"
          >
            Book Your Consultation
          </Link>
          <a
            href="tel:4809996100"
            className="inline-flex items-center gap-2 rounded-[2px] border border-off-white/40 bg-teal-dark/40 px-[26px] py-[14px] text-[13px] tracking-[0.06em] text-off-white no-underline backdrop-blur-[4px] transition-colors hover:border-gold hover:text-gold"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            (480) 999-6100
          </a>
        </motion.div>

        {/* Stats row — lives inside the hero in V2 */}
        <motion.div
          variants={fadeUpVariants}
          className="mt-11 flex flex-wrap gap-x-[46px] gap-y-6 border-t border-off-white/[0.18] pt-6"
        >
          {stats.map((stat) => (
            <div key={stat.label}>
              <span className="block font-heading text-[30px] font-medium leading-none text-gold tabular-nums">
                <CountUp value={stat.number} />
              </span>
              <span className="mt-1.5 block font-mono text-[10.5px] uppercase tracking-[0.18em] text-off-white/[0.65]">
                {stat.label}
              </span>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
