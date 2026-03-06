"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

const services = [
  { name: "Kitchen Remodeling", tag: "\u2192" },
  { name: "Bathroom Renovation", tag: "\u2192" },
  { name: "Whole-Home Remodels", tag: "\u2192" },
  { name: "Outdoor Living", tag: "\u2192" },
  { name: "Electrical", tag: "ROC #350715" },
  { name: "HVAC", tag: "ROC #350714" },
  { name: "Plumbing", tag: "ROC #350716" },
];

export function ServicesGrid() {
  return (
    <section className="py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-12 bg-cream" aria-label="Services">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-16 lg:gap-20 items-start">
          {/* Left: Text + Service List */}
          <div>
            <div className="section-label">Services</div>
            <h2 className="font-heading text-3xl lg:text-[42px] font-medium text-teal max-w-[560px] leading-[1.15] tracking-[-0.02em] mb-5">
              Everything under one roof
            </h2>
            <p className="text-[15px] text-charcoal-light max-w-[480px] leading-relaxed font-light mb-12">
              Four ROC licenses mean we handle every trade in-house. No subcontractor coordination. No finger-pointing. One team, one standard.
            </p>

            <ul className="list-none p-0 m-0">
              {services.map((svc, i) => (
                <motion.li
                  key={svc.name}
                  className="py-7 border-b border-teal/[0.08] flex justify-between items-center cursor-pointer group first:border-t first:border-teal/[0.08] hover:pl-3 transition-[padding] duration-300"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <span className="font-heading text-lg sm:text-[22px] font-medium text-teal group-hover:text-gold transition-colors">
                    {svc.name}
                  </span>
                  <span className="text-[11px] tracking-[0.1em] uppercase text-charcoal-light font-normal">
                    {svc.tag}
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>

          {/* Right: Feature Image */}
          <motion.div
            className="relative h-[420px] lg:h-[580px] overflow-hidden"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <Image
              src="/images/wetbar.jpg"
              alt="Custom wet bar with wine wall"
              fill
              className="object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-7 bg-teal-90">
              <p className="text-[13px] text-stone/70 font-light leading-relaxed">
                <strong className="text-gold font-medium">McCormick Ranch</strong> &mdash; Custom wet bar with floating shelves, integrated wine wall, and beverage center. Designed, built, and wired by our in-house team.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
