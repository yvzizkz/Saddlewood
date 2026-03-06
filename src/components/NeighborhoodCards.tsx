"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const hoods = [
  {
    name: "McCormick Ranch",
    zip: "85258",
    tagline: "Timeless elegance in the heart of Scottsdale",
    image: "/images/kitchen2.jpg",
    href: "/neighborhoods/mccormick-ranch",
  },
  {
    name: "Gainey Ranch",
    zip: "85258",
    tagline: "Refined living with desert sophistication",
    image: "/images/fireplace.jpg",
    href: "/neighborhoods/gainey-ranch",
  },
  {
    name: "Pinnacle Peak",
    zip: "85255",
    tagline: "Modern luxury at the base of the mountain",
    image: "/images/dining.jpg",
    href: "/neighborhoods/pinnacle-peak",
  },
];

export function NeighborhoodCards() {
  return (
    <section className="bg-teal-dark">
      <div className="py-16 lg:py-20 px-6 lg:px-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="section-label">Neighborhoods</div>
          <h2 className="font-heading text-3xl lg:text-[42px] font-medium text-stone leading-[1.15] tracking-[-0.02em]">
            Where we work
          </h2>
        </div>
      </div>

      {/* Edge-to-edge image cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px]">
        {hoods.map((hood, i) => (
          <motion.div
            key={hood.name}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
          >
            <Link
              href={hood.href}
              className="relative block h-[400px] lg:h-[520px] overflow-hidden group no-underline"
            >
              <Image
                src={hood.image}
                alt={hood.name}
                fill
                className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[rgba(15,37,48,0.85)] via-[rgba(15,37,48,0.2)_60%] to-[rgba(15,37,48,0.35)] group-hover:from-[rgba(15,37,48,0.9)] group-hover:via-[rgba(15,37,48,0.3)_60%] group-hover:to-[rgba(15,37,48,0.15)] transition-all duration-400" />
              <div className="absolute bottom-0 left-0 right-0 p-8 lg:p-10">
                <div className="text-[10px] tracking-[0.3em] uppercase text-gold font-medium mb-3">
                  {hood.zip}
                </div>
                <h3 className="font-heading text-2xl lg:text-[28px] text-white font-medium mb-2">
                  {hood.name}
                </h3>
                <p className="text-[13px] text-white/50 font-light mb-5">{hood.tagline}</p>
                <div className="w-10 h-10 border border-white/20 flex items-center justify-center group-hover:border-gold group-hover:bg-gold transition-all duration-300">
                  <ArrowRight className="w-4 h-4 text-white/60 group-hover:text-teal-dark transition-colors duration-300" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
