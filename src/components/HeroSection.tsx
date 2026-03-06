"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Phone } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative h-screen min-h-[600px] sm:min-h-[700px] flex items-end overflow-hidden" aria-label="Hero">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/images/hero.jpg"
          alt="Saddlewood Contracting luxury kitchen remodel in Scottsdale"
          fill
          className="object-cover"
          priority
        />
      </div>

      {/* Gradient Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to top, rgba(15,37,48,0.92) 0%, rgba(15,37,48,0.5) 35%, rgba(15,37,48,0.15) 60%, rgba(15,37,48,0.25) 100%)",
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
          <span className="w-8 h-px bg-gold" />
          <span className="text-[11px] font-medium tracking-[0.25em] uppercase text-gold">
            Scottsdale&apos;s Premier Contractor
          </span>
        </div>

        <h1 className="font-heading text-4xl md:text-5xl lg:text-[56px] font-medium text-white mb-5 leading-[1.15] tracking-[-0.02em]">
          Where Craftsmanship<br />
          Meets <em className="italic text-gold font-normal">Character</em>
        </h1>

        <p className="text-base text-white/60 font-light max-w-[480px] leading-relaxed mb-9">
          Luxury kitchen, bathroom, and whole-home remodeling in Scottsdale&apos;s most prestigious neighborhoods.
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Link
            href="/portfolio"
            className="inline-block px-8 py-3.5 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase no-underline hover:bg-[#d4a94c] transition-all hover:-translate-y-px"
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
