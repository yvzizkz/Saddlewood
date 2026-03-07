"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const projects = [
  {
    image: "/images/mcr-kitchen-island-01.jpg",
    alt: "McCormick Ranch modern kitchen with custom waterfall island",
    category: "Kitchen",
    location: "McCormick Ranch",
    title: "Modern Kitchen Transformation",
    caption: "Custom waterfall island with integrated prep sink and pendant lighting — the centerpiece of this McCormick Ranch kitchen.",
    tall: true,
  },
  {
    image: "/images/mcr-bathroom-tub.jpg",
    alt: "Spa-inspired master bath with freestanding soaking tub and chandelier",
    category: "Bathroom",
    location: "McCormick Ranch",
    title: "Spa-Inspired Master Bath",
    caption: "A freestanding soaking tub and chandelier transform this master bath into a private retreat.",
    tall: false,
  },
  {
    image: "/images/pp-kitchen-01.jpg",
    alt: "Pinnacle Peak contemporary kitchen with designer finishes",
    category: "Kitchen",
    location: "Pinnacle Peak",
    title: "Contemporary Kitchen",
    caption: "Designer finishes and professional-grade appliances come together in this Pinnacle Peak kitchen renovation.",
    tall: false,
  },
];

export function WorkShowcase() {
  return (
    <section className="py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-12 bg-off-white" aria-label="Recent projects">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="section-label">Selected Work</div>
            <h2 className="font-heading text-3xl lg:text-[42px] font-medium text-teal max-w-[560px] leading-[1.15] tracking-[-0.02em]">
              Recent Projects
            </h2>
          </div>
          <Link
            href="/portfolio"
            className="hidden md:flex items-center gap-2 text-[13px] text-teal font-medium tracking-wide no-underline pb-1 border-b border-teal hover:text-gold hover:border-gold transition-colors"
          >
            View all projects
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Editorial Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
          {projects.map((project, i) => (
            <motion.div
              key={project.title}
              className={`relative overflow-hidden cursor-pointer group ${
                project.tall ? "md:row-span-2 h-[400px] md:h-auto" : "h-[320px]"
              }`}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Image
                src={project.image}
                alt={project.alt}
                fill
                className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[rgba(15,37,48,0.85)] via-[rgba(15,37,48,0.3)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
              <div className="absolute bottom-0 left-0 right-0 p-8 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-400 delay-50">
                <div className="text-[10px] tracking-[0.2em] uppercase text-gold font-medium mb-1.5">
                  {project.category} &middot; {project.location}
                </div>
                <h3 className="font-heading text-[22px] text-white font-medium mb-2">{project.title}</h3>
                <p className="text-white/70 text-[13px] font-light leading-relaxed max-w-md">
                  {project.caption}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Mobile view-all */}
        <Link
          href="/portfolio"
          className="md:hidden flex items-center justify-center gap-2 mt-8 text-[13px] text-teal font-medium tracking-wide no-underline pb-1 border-b border-teal hover:text-gold hover:border-gold transition-colors w-fit mx-auto"
        >
          View all projects
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
