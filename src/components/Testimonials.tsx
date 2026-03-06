"use client";

import { motion } from "framer-motion";
import Image from "next/image";

export function Testimonials() {
  return (
    <section className="py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-12 bg-off-white" aria-label="Client testimonials">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-16 lg:gap-20 items-center">
          {/* Quote */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="section-label">Client Stories</div>
            <blockquote className="font-heading text-xl lg:text-[26px] font-normal italic text-teal leading-[1.5] pl-8 border-l-2 border-gold mt-8">
              We interviewed five contractors before choosing Saddlewood. Their professionalism and the fact that they hold four ROC licenses gave us complete confidence. The finished master bath is stunning.
            </blockquote>
            <div className="mt-8 pl-8">
              <div className="text-sm font-semibold text-charcoal">Michael R.</div>
              <div className="text-[12px] text-charcoal-light mt-0.5">
                Master Bathroom &mdash; Gainey Ranch
              </div>
            </div>
          </motion.div>

          {/* Image */}
          <motion.div
            className="relative h-[360px] lg:h-[480px] overflow-hidden"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            <Image
              src="/images/bathroom1.jpg"
              alt="Luxury bathroom remodel"
              fill
              className="object-cover"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
