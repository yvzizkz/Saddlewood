"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Phone } from "lucide-react";

type CTAVariant = "homeowner" | "builders";

/** variant="builders": the framing/trade-partners audience is a GC deciding whether
 *  to shortlist a sub — "transform your home" was the wrong close for that page. */
export function CTABanner({ variant = "homeowner" }: { variant?: CTAVariant } = {}) {
  if (variant === "builders") {
    return (
      <section className="bg-teal-dark py-12 sm:py-14 lg:py-16 px-4 sm:px-6 lg:px-12 text-center" aria-label="Call to action">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="font-heading text-3xl lg:text-5xl text-white font-medium mb-5 leading-[1.15] tracking-[-0.02em]">
            Have a project<br />
            to <em className="italic text-gold font-normal">bid?</em>
          </h2>
          <p className="text-[15px] text-white/60 max-w-[480px] mx-auto font-light leading-relaxed mb-10">
            Send us your plans — we&apos;ll review the scope and come back with a real number, fast. Self-performed crew, ROC licensed, built to your schedule.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center items-center">
            <a
              href="mailto:info@saddlewoodcontracting.com?subject=Plans%20for%20bid"
              className="inline-block px-8 py-3.5 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase no-underline hover:bg-[#d4a94c] transition-all hover:-translate-y-px"
            >
              Send Us Your Plans
            </a>
            <a
              href="tel:4809996100"
              className="inline-flex items-center gap-2 px-8 py-3.5 border border-white/20 text-white/70 text-[12px] font-medium tracking-[0.08em] uppercase no-underline hover:border-gold hover:text-gold transition-all"
            >
              <Phone className="w-3.5 h-3.5" />
              (480) 999-6100
            </a>
          </div>
        </motion.div>
      </section>
    );
  }
  return (
    <section className="bg-teal-dark py-12 sm:py-14 lg:py-16 px-4 sm:px-6 lg:px-12 text-center" aria-label="Call to action">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <h2 className="font-heading text-3xl lg:text-5xl text-white font-medium mb-5 leading-[1.15] tracking-[-0.02em]">
          Ready to transform<br />
          your <em className="italic text-gold font-normal">home?</em>
        </h2>
        <p className="text-[15px] text-white/60 max-w-[480px] mx-auto font-light leading-relaxed mb-10">
          Start with a free, no-obligation design consultation. We&apos;ll walk your space, discuss your vision, and provide a detailed estimate.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center items-center">
          <Link
            href="/contact"
            className="inline-block px-8 py-3.5 bg-gold text-teal-dark text-[12px] font-semibold tracking-[0.1em] uppercase no-underline hover:bg-[#d4a94c] transition-all hover:-translate-y-px"
          >
            Schedule Consultation
          </Link>
          <a
            href="tel:4809996100"
            className="inline-flex items-center gap-2 px-8 py-3.5 border border-white/20 text-white/70 text-[12px] font-medium tracking-[0.08em] uppercase no-underline hover:border-gold hover:text-gold transition-all"
          >
            <Phone className="w-3.5 h-3.5" />
            (480) 999-6100
          </a>
        </div>
      </motion.div>
    </section>
  );
}
