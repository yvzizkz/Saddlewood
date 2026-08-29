"use client";

/**
 * The four ROC licenses, stated once on the homepage (owner note,
 * 2026-08-28: "I'm not sure that is stated anywhere, could come after the
 * framing stuff, all 4 licenses residential and commercial").
 *
 * Classifications are the real ones on file with the Arizona Registrar of
 * Contractors: KB-2 is a dual residential and small commercial general
 * license, and CR-class specialty licenses are dual commercial and
 * residential. The "small commercial" qualifier on the general license is
 * kept verbatim rather than rounded up to "commercial".
 *
 * Sits on the page ground between two dark sections, so it is bounded top
 * and bottom by brass hairlines and reads as a credential strip rather than
 * a second section in the same key.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import {
  revealVariants,
  revealStaticVariants,
  REVEAL_STEP,
  REVEAL_VIEWPORT,
} from "@/lib/reveal";

const licenses = [
  {
    trade: "General",
    code: "KB-2",
    scope: "Dual residential and small commercial",
    roc: "ROC #305762",
  },
  {
    trade: "Electrical",
    code: "CR-11",
    scope: "Dual commercial and residential",
    roc: "ROC #350715",
  },
  {
    trade: "Plumbing",
    code: "CR-37",
    scope: "Dual commercial and residential",
    roc: "ROC #350716",
  },
  {
    trade: "HVAC",
    code: "CR-39",
    scope: "Air conditioning and refrigeration",
    roc: "ROC #350714",
  },
];

export function LicenseLedger() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const variants = prefersReducedMotion ? revealStaticVariants : revealVariants;

  return (
    <section
      className="relative border-y border-gold/[0.28] py-[clamp(56px,7vh,84px)]"
      aria-label="Licensed trades and ROC numbers"
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <div className="grid items-end gap-x-[clamp(40px,6vw,88px)] gap-y-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <motion.div
            variants={variants}
            initial="hidden"
            whileInView="visible"
            viewport={REVEAL_VIEWPORT}
          >
            <span className="section-label !mb-0">Licensed In-House</span>
            <h2 className="mt-5 max-w-[21ch] font-heading text-[clamp(30px,3.6vw,46px)] font-medium leading-[1.14] tracking-[-0.02em] text-off-white">
              Four licenses.{" "}
              <em className="font-normal italic text-gold">
                Residential and commercial.
              </em>
            </h2>
          </motion.div>
          <motion.p
            variants={variants}
            custom={REVEAL_STEP}
            initial="hidden"
            whileInView="visible"
            viewport={REVEAL_VIEWPORT}
            className="max-w-[54ch] text-[15.5px] leading-[1.8] text-off-white/70"
          >
            General contracting plus all three MEP trades, held by Saddlewood
            and active with the Arizona Registrar of Contractors. Each one is a
            dual classification, so the crew that frames your house is licensed
            to wire it, plumb it, and condition it, on residential and
            commercial work alike.
          </motion.p>
        </div>

        <ul className="mt-[clamp(36px,5vh,56px)] grid list-none grid-cols-1 gap-px border border-gold/[0.18] bg-gold/[0.18] p-0 sm:grid-cols-2 lg:grid-cols-4">
          {licenses.map((license, i) => (
            <motion.li
              key={license.roc}
              variants={variants}
              custom={REVEAL_STEP * i}
              initial="hidden"
              whileInView="visible"
              viewport={REVEAL_VIEWPORT}
              className="bg-teal-dark px-6 py-7 sm:px-7 sm:py-8"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-heading text-xl font-medium text-off-white sm:text-2xl">
                  {license.trade}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-gold">
                  {license.code}
                </span>
              </div>
              <p className="mt-2.5 max-w-[26ch] text-[13px] leading-[1.6] text-off-white/[0.62]">
                {license.scope}
              </p>
              <div className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.2em] text-off-white/[0.45] tabular-nums">
                {license.roc}
              </div>
            </motion.li>
          ))}
        </ul>

        <motion.p
          variants={variants}
          custom={REVEAL_STEP}
          initial="hidden"
          whileInView="visible"
          viewport={REVEAL_VIEWPORT}
          className="mt-7 text-[12.5px] leading-[1.7] text-off-white/[0.5]"
        >
          Verify any of them at{" "}
          <Link
            href="https://azroc.my.site.com/AZRoc/s/contractor-search"
            target="_blank"
            rel="noopener noreferrer"
            className="border-b border-gold/40 text-off-white/[0.7] no-underline transition-colors hover:border-gold hover:text-off-white"
          >
            azroc.gov
          </Link>
          .
        </motion.p>
      </div>
    </section>
  );
}
