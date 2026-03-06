"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface PageHeroProps {
  label: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
}

export function PageHero({ label, title, description, image, imageAlt }: PageHeroProps) {
  return (
    <section className="relative min-h-[420px] sm:min-h-[480px] lg:min-h-[540px] flex items-end overflow-hidden" role="banner">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src={image}
          alt={imageAlt}
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
      </div>

      {/* Gradient Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(15,37,48,0.92) 0%, rgba(15,37,48,0.65) 40%, rgba(15,37,48,0.3) 70%, rgba(15,37,48,0.4) 100%)",
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <motion.div
        className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-14 sm:pb-16 lg:pb-20 pt-28 sm:pt-32"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
      >
        <div className="max-w-2xl">
          <span className="text-gold text-sm tracking-[0.2em] uppercase font-light">
            {label}
          </span>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-light text-stone mt-4 sm:mt-6 mb-4 sm:mb-6 leading-tight">
            {title}
          </h1>
          <p className="text-stone/80 text-base sm:text-lg font-light leading-relaxed max-w-xl">
            {description}
          </p>
        </div>
      </motion.div>
    </section>
  );
}
