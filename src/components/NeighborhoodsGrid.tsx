"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { neighborhoods } from "@/lib/neighborhoods";

export function NeighborhoodsGrid() {
  const hoods = Object.values(neighborhoods);

  return (
    <section className="bg-teal-dark" aria-label="Neighborhoods we serve">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[2px]">
        {hoods.map((hood, i) => (
          <motion.div
            key={hood.slug}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
          >
            <Link
              href={`/neighborhoods/${hood.slug}`}
              className="relative block h-[400px] lg:h-[500px] overflow-hidden group no-underline"
            >
              <Image
                src={hood.heroImage}
                alt={`${hood.name} remodeling by Saddlewood Contracting`}
                fill
                className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[rgba(26,47,47,0.85)] via-[rgba(26,47,47,0.2)_60%] to-[rgba(26,47,47,0.35)] group-hover:from-[rgba(26,47,47,0.9)] group-hover:via-[rgba(26,47,47,0.3)_60%] group-hover:to-[rgba(26,47,47,0.15)] transition-all duration-400" />
              <div className="absolute bottom-0 left-0 right-0 p-8 lg:p-10">
                <div className="text-[10px] tracking-[0.3em] uppercase text-gold font-medium mb-3">
                  {hood.zip}
                </div>
                <h3 className="font-heading text-2xl lg:text-[28px] text-white font-medium mb-2">
                  {hood.name}
                </h3>
                <p className="text-[13px] text-white/65 font-light mb-5 min-h-[40px]">
                  {hood.tagline}
                </p>
                <div className="w-10 h-10 border border-white/20 flex items-center justify-center group-hover:border-gold group-hover:bg-gold transition-all duration-300">
                  <ArrowRight className="w-4 h-4 text-white/60 group-hover:text-teal-dark transition-colors duration-300" aria-hidden="true" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
