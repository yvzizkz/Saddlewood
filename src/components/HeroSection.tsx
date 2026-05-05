"use client";

import { useState, useEffect } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Phone } from "lucide-react";

const heroImages = [
  {
    src: "/images/pv-exterior-pool-golden-hour.jpg",
    alt: "Paradise Valley pool at golden hour with mountain backdrop",
  },
  {
    src: "/images/pv-great-room-chandelier-pool.jpg",
    alt: "Great room with sculptural chandelier opening to pool and patio",
  },
  {
    src: "/images/pv-exterior-aerial-sunset-mountain.jpg",
    alt: "Aerial sunset view of Paradise Valley estate against the mountains",
  },
  {
    src: "/images/pv-kitchen-from-wine-wall.jpg",
    alt: "Chef's kitchen with coffered ceiling, stone wine wall, and island seating",
  },
  {
    src: "/images/pv-exterior-front-sunset.jpg",
    alt: "Paradise Valley estate front facade at sunset",
  },
  {
    src: "/images/pv-master-bath-silver-tub-wide.jpg",
    alt: "Master bath with hammered silver freestanding tub and fluted glass shower",
  },
  {
    src: "/images/pv-exterior-pool-lounge-twilight.jpg",
    alt: "Pool deck with lounge furniture at twilight",
  },
  {
    src: "/images/pv-master-bedroom-wide.jpg",
    alt: "Primary bedroom with oak headboard wall, oversized skylight, and framed window view",
  },
];

// ease-out cubic — cinematic settle
const EASE = [0.22, 1, 0.36, 1] as const;

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.6,
      staggerChildren: 0.18,
    },
  },
};

const lineVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, ease: EASE },
  },
};

const ctaVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

export function HeroSection() {
  const [index, setIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    setIndex(Math.floor(Math.random() * heroImages.length));
  }, []);

  const hero = heroImages[index];
  const initial = prefersReducedMotion ? "visible" : "hidden";

  return (
    <section
      className="relative h-screen min-h-[600px] sm:min-h-[700px] flex items-end overflow-hidden"
      aria-label="Hero"
    >
      <div key={hero.src} className="absolute inset-0 ken-burns-active">
        <Image
          src={hero.src}
          alt={hero.alt}
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
      </div>

      {/* Gradient — bottom darkens enough for white text to read cleanly */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(to top, rgba(26,47,47,0.92) 0%, rgba(26,47,47,0.5) 35%, rgba(26,47,47,0.15) 60%, rgba(26,47,47,0.25) 100%)",
        }}
      />

      {/* Content — bottom-left, staggered reveal */}
      <motion.div
        className="relative z-10 px-6 lg:px-12 pb-16 lg:pb-20 max-w-[720px]"
        variants={containerVariants}
        initial={initial}
        animate="visible"
      >
        <h1 className="font-heading text-4xl md:text-5xl lg:text-[64px] font-medium text-white mb-9 leading-[1.15] tracking-[-0.02em]">
          <motion.span variants={lineVariants} className="block">
            Built for Homes
          </motion.span>
          <motion.span variants={lineVariants} className="block">
            That Demand{" "}
            <em className="italic text-gold font-normal">More.</em>
          </motion.span>
        </h1>

        <motion.div
          variants={ctaVariants}
          className="flex flex-col sm:flex-row items-start sm:items-center gap-4"
        >
          <Link
            href="/contact"
            className="inline-block px-10 py-4 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase rounded-sm no-underline hover:bg-[#d4a94c] transition-all hover:-translate-y-px"
          >
            Book Your Consultation
          </Link>
          <a
            href="tel:4809996100"
            className="inline-flex items-center gap-2 py-3.5 text-[13px] text-white/70 font-normal tracking-wide no-underline hover:text-gold transition-colors"
          >
            <Phone className="w-4 h-4" />
            (480) 999-6100
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
