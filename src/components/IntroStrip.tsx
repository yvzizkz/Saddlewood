"use client";

import { motion } from "framer-motion";

const stats = [
  { number: "4", label: "Active ROC Licenses" },
  { number: "3", label: "Premier Neighborhoods" },
  { number: "1", label: "Point of Contact" },
];

export function IntroStrip() {
  return (
    <div className="bg-teal py-12 sm:py-16 px-4 sm:px-6 lg:px-12" role="region" aria-label="Key statistics">
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-12 items-center">
        {stats.map((stat, i) => (
          <div key={stat.label} className="contents">
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
            >
              <div className="font-heading text-4xl font-medium text-gold leading-none">
                {stat.number}
              </div>
              <div className="text-[12px] tracking-[0.1em] uppercase text-stone/50 font-normal mt-2">
                {stat.label}
              </div>
            </motion.div>
            {i < stats.length - 1 && (
              <div className="hidden md:block h-12 w-px bg-white/10 justify-self-center" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
