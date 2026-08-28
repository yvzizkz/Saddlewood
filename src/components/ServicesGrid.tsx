"use client";

/**
 * Services — three disciplines, each drawn as a numbered plate with its
 * own self-drawing linework diagram, closed by the real ROC trade row.
 * Copy is sourced from the live service pages and About credentials.
 */

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import {
  MassingDiagram,
  SteelBeam,
  WallSection,
} from "@/components/linework";

const EASE = [0.22, 1, 0.36, 1] as const;

const services = [
  {
    idx: "01",
    title: "New Construction",
    href: "/new-construction",
    copy: "From the initial slab to the final roof trusses, we self-perform the entire structure. A true ground-up builder for Scottsdale and Paradise Valley.",
    Diagram: MassingDiagram,
  },
  {
    idx: "02",
    title: "Whole-Home Remodels",
    href: "/services",
    copy: "Full-scope general contracting for residential remodels of any size, with every trade coordinated by one accountable team.",
    Diagram: WallSection,
  },
  {
    idx: "03",
    title: "Framing",
    href: "/framing",
    copy: "Structural steel and conventional framing. Self-performed crew, ROC licensed, built to your schedule.",
    Diagram: SteelBeam,
  },
];

const trades = [
  { name: "General", roc: "ROC #305762" },
  { name: "Electrical", roc: "ROC #350715" },
  { name: "HVAC", roc: "ROC #350714" },
  { name: "Plumbing", roc: "ROC #350716" },
];

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: EASE, delay },
  }),
};

export function ServicesGrid() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";
  const viewport = { once: true, margin: "-36px" } as const;

  return (
    <section
      className="relative pb-[clamp(100px,13vh,160px)] pt-[clamp(90px,11vh,140px)]"
      aria-label="Services"
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        {/* Head */}
        <motion.div
          className="max-w-[640px]"
          variants={revealVariants}
          initial={initial}
          whileInView="visible"
          viewport={viewport}
        >
          <span className="section-label !mb-0">What We Build</span>
          <h2 className="mt-6 font-heading text-[clamp(36px,4.4vw,60px)] font-medium leading-[1.12] tracking-[-0.02em] text-off-white">
            Three Disciplines. One&nbsp;
            <em className="font-normal italic text-gold">Crew.</em>
          </h2>
          <p className="mt-5 font-heading text-[clamp(19px,2vw,22px)] font-medium leading-[1.5] tracking-[-0.01em] text-off-white/85">
            Four licenses. One crew. Every trade handled in-house from demo to
            final&nbsp;detail.
          </p>
        </motion.div>

        {/* Plates */}
        <div className="mt-[clamp(48px,7vh,84px)] grid grid-cols-1 gap-px border border-off-white/[0.12] bg-off-white/[0.12] md:grid-cols-3">
          {services.map((service, i) => (
            <motion.div
              key={service.idx}
              className="h-full"
              variants={revealVariants}
              custom={i * 0.12}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <Link
                href={service.href}
                className="group flex h-full flex-col bg-teal-dark p-7 no-underline transition-colors duration-500 hover:bg-[#203939] lg:p-11"
              >
                <div className="mb-6 text-[10.5px] font-medium tracking-[0.25em] text-gold">
                  {service.idx}
                </div>
                <div aria-hidden="true">
                  <service.Diagram className="mb-6 block h-[170px] w-full max-w-[320px] md:max-w-none" />
                </div>
                <h3 className="font-heading text-[21px] font-medium text-off-white lg:text-[24px]">
                  {service.title}
                </h3>
                <p className="mt-3 text-[13.5px] leading-[1.7] text-off-white/[0.62]">
                  {service.copy}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* ROC trade row */}
        <motion.div
          className="mt-[clamp(44px,6vh,64px)] flex flex-col items-center gap-2.5 text-center"
          variants={revealVariants}
          custom={0.1}
          initial={initial}
          whileInView="visible"
          viewport={viewport}
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.25em] text-off-white/65">
            {trades.map((t, i) => (
              <span key={t.name}>
                {i > 0 && (
                  <span className="mx-2.5 text-gold" aria-hidden="true">
                    ·
                  </span>
                )}
                {t.name}
              </span>
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-off-white/55">
            {trades.map((t, i) => (
              <span key={t.roc}>
                {i > 0 && (
                  <span className="mx-2.5" aria-hidden="true">
                    ·
                  </span>
                )}
                {t.roc}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
