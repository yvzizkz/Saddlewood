"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Phone } from "lucide-react";

const heroImages = [
  {
    src: "/images/pv-entry-foyer.jpg",
    alt: "Paradise Valley grand entry foyer with exposed beams and curated art",
  },
  {
    src: "/images/pv-living-room-chandelier.jpg",
    alt: "Paradise Valley great room with ring chandelier and mountain views",
  },
  {
    src: "/images/pv-kitchen-island-wide.jpg",
    alt: "Paradise Valley chef's kitchen with natural stone island",
  },
  {
    src: "/images/pv-aerial-sunset.jpg",
    alt: "Aerial sunset view of luxury Paradise Valley home remodel",
  },
];

const INTERVAL_MS = 6000;

export function HeroSection() {
  const [activeIndex, setActiveIndex] = useState(0);

  const advance = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % heroImages.length);
  }, []);

  useEffect(() => {
    let timer = setInterval(advance, INTERVAL_MS);

    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(timer);
      } else {
        timer = setInterval(advance, INTERVAL_MS);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [advance]);

  return (
    <section className="relative h-screen min-h-[600px] sm:min-h-[700px] flex items-end overflow-hidden" aria-label="Hero">
      {/* Background Images — stacked, crossfade via opacity */}
      {heroImages.map((img, i) => (
        <div
          key={img.src}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === activeIndex ? "opacity-100" : "opacity-0"
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
      ))}

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
            Scottsdale&apos;s Premier Contractor
          </span>
        </div>

        <h1 className="font-heading text-4xl md:text-5xl lg:text-[64px] font-medium text-white mb-5 leading-[1.15] tracking-[-0.02em]">
          Where Craftsmanship<br />
          Meets <em className="italic text-gold font-normal">Character</em>
        </h1>

        <p className="text-base text-white/60 font-light max-w-[480px] leading-relaxed mb-9">
          Luxury kitchen, bathroom, and whole-home remodeling in Scottsdale&apos;s most prestigious neighborhoods.
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Link
            href="/portfolio"
            className="inline-block px-10 py-4 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase rounded-sm no-underline hover:bg-[#d4a94c] transition-all hover:-translate-y-px"
          >
            View Our Work
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
