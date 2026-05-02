"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
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

const HOLD_MS = 6000;
const FADE_MS = 1500;

export function HeroSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const advance = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % heroImages.length);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;

    let timer = setInterval(advance, HOLD_MS);

    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(timer);
      } else {
        timer = setInterval(advance, HOLD_MS);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [advance, prefersReducedMotion]);

  return (
    <section className="relative h-screen min-h-[600px] sm:min-h-[700px] flex items-end overflow-hidden" aria-label="Hero">
      {/* Background Images — stacked, crossfade via opacity, Ken Burns on active */}
      {heroImages.map((img, i) => {
        const isActive = i === activeIndex;
        return (
          <div
            key={img.src}
            className={`absolute inset-0 transition-opacity ease-in-out ${
              isActive ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDuration: `${FADE_MS}ms` }}
            aria-hidden={!isActive}
          >
            <div
              className={`absolute inset-0 ${
                isActive && !prefersReducedMotion ? "ken-burns-active" : ""
              }`}
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                className="object-cover"
                priority={i === 0}
                loading={i === 0 ? undefined : "eager"}
                sizes="100vw"
              />
            </div>
          </div>
        );
      })}

      {/* Gradient Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to top, rgba(26,47,47,0.92) 0%, rgba(26,47,47,0.5) 35%, rgba(26,47,47,0.15) 60%, rgba(26,47,47,0.25) 100%)",
        }}
      />

      {/* Content — Bottom Left Aligned */}
      <motion.div
        className="relative z-10 px-6 lg:px-12 pb-16 lg:pb-20 max-w-[720px]"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <div className="flex items-center gap-3 mb-5">
          <span className="w-8 h-px bg-gold" aria-hidden="true" />
          <span className="text-[14px] font-bold tracking-[0.25em] uppercase text-gold drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] [text-shadow:0_1px_8px_rgba(0,0,0,0.7),0_0_20px_rgba(0,0,0,0.5)]">
            Luxury Remodeling in Scottsdale&apos;s Finest Neighborhoods
          </span>
        </div>

        <h1 className="font-heading text-4xl md:text-5xl lg:text-[64px] font-medium text-white mb-5 leading-[1.15] tracking-[-0.02em]">
          Built for Homes<br />
          That Demand <em className="italic text-gold font-normal">More.</em>
        </h1>

        <p className="text-base text-white/60 font-light max-w-[560px] leading-relaxed mb-9">
          Whole-home remodels, chef&apos;s kitchens, and spa bathrooms crafted for the way you actually live — delivered by a single licensed team with no subcontractors.
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
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
        </div>
      </motion.div>
    </section>
  );
}
