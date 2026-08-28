"use client";

/**
 * Closing CTA band — teal ground with gold hairlines and a soft radial
 * gold glow, distinct from the teal-dark page ground. Copy and hrefs are
 * unchanged from the previous version (punctuation only: no em dashes).
 */

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { Phone } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

type CTAVariant = "homeowner" | "builders";

function CTAShell({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <section
      className="relative overflow-hidden border-y border-gold/[0.22] bg-teal px-5 py-[clamp(88px,11vh,140px)] text-center sm:px-8"
      aria-label="Call to action"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 55% 70% at 50% 50%, rgba(200,165,90,0.10), transparent 70%)",
        }}
      />
      <motion.div
        className="relative"
        initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-36px" }}
        transition={{ duration: 1, ease: EASE }}
      >
        {children}
      </motion.div>
    </section>
  );
}

const goldBtn =
  "inline-block rounded-[2px] bg-gold px-[34px] py-[15px] text-[12px] font-semibold uppercase tracking-[0.1em] text-teal-dark no-underline transition-all hover:-translate-y-px hover:bg-[#d4a94c] hover:shadow-[0_10px_34px_rgba(200,165,90,0.28)]";

const lineBtn =
  "inline-flex items-center gap-2 rounded-[2px] border border-off-white/25 px-[26px] py-[14px] text-[12px] font-medium uppercase tracking-[0.08em] text-off-white/80 no-underline transition-colors hover:border-gold hover:text-gold";

/** variant="builders": the framing/trade-partners audience is a GC deciding whether
 *  to shortlist a sub — "transform your home" was the wrong close for that page. */
export function CTABanner({ variant = "homeowner" }: { variant?: CTAVariant } = {}) {
  if (variant === "builders") {
    return (
      <CTAShell>
        <h2 className="font-heading text-[clamp(38px,5vw,64px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white">
          Have a project
          <br />
          to <em className="font-normal italic text-gold">bid?</em>
        </h2>
        <p className="mx-auto mt-6 max-w-[480px] text-[15px] leading-[1.8] text-off-white/[0.68]">
          Send us your plans. We&apos;ll review the scope and come back with a
          real number, fast. Self-performed crew, ROC licensed, built to your
          schedule.
        </p>
        <div className="mt-11 flex flex-wrap items-center justify-center gap-4">
          <a
            href="mailto:info@saddlewoodcontracting.com?subject=Plans%20for%20bid"
            className={goldBtn}
          >
            Send Us Your Plans
          </a>
          <a href="tel:4809996100" className={lineBtn}>
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            (480) 999-6100
          </a>
        </div>
      </CTAShell>
    );
  }
  return (
    <CTAShell>
      <h2 className="font-heading text-[clamp(38px,5vw,64px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white">
        Ready to transform
        <br />
        your <em className="font-normal italic text-gold">home?</em>
      </h2>
      <p className="mx-auto mt-6 max-w-[480px] text-[15px] leading-[1.8] text-off-white/[0.68]">
        Start with a free, no-obligation design consultation. We&apos;ll walk
        your space, discuss your vision, and provide a detailed estimate.
      </p>
      <div className="mt-11 flex flex-wrap items-center justify-center gap-4">
        <Link href="/contact" className={goldBtn}>
          Schedule Consultation
        </Link>
        <a href="tel:4809996100" className={lineBtn}>
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          (480) 999-6100
        </a>
      </div>
    </CTAShell>
  );
}
