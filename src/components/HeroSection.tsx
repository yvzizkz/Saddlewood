"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

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

export function HeroSection() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * heroImages.length));
  }, []);

  const hero = heroImages[index];

  return (
    <section className="relative h-screen min-h-[600px] sm:min-h-[700px] overflow-hidden" aria-label="Hero">
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

      {/* Subtle bottom-left vignette — only enough for the location lockup to read */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: "radial-gradient(circle at bottom left, rgba(26,47,47,0.4) 0%, rgba(26,47,47,0) 38%)",
        }}
      />

      {/* Location lockup — editorial photo-credit treatment */}
      <div className="absolute bottom-6 left-6 sm:bottom-8 sm:left-8 lg:bottom-12 lg:left-12 z-10">
        <span className="text-[11px] tracking-[0.25em] uppercase text-gold/75">
          Scottsdale, AZ
        </span>
      </div>
    </section>
  );
}
