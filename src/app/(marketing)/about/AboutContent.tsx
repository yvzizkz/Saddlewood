"use client";

/**
 * About — Night Blueprint v2. No photography: the hero carries a wall-section
 * drawing (the craft, drawn rather than photographed), the story and values
 * sit on the dark page ground, credentials read as numbered license plates,
 * and the service area closes on a teal band. All copy preserved from the
 * previous version (punctuation only: no em dashes).
 */

import { motion, useReducedMotion, type Variants } from "framer-motion";
import Link from "next/link";
import { Phone } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { ProcoreBadge } from "@/components/ProcoreBadge";
import { BlueprintDivider, WallSection } from "@/components/linework";

const EASE = [0.22, 1, 0.36, 1] as const;

const credentials = [
  {
    title: "General Contractor",
    detail: "ROC #305762",
    description: "Full-scope general contracting for residential remodels of any size.",
  },
  {
    title: "HVAC License",
    detail: "ROC #350714",
    description: "We install and service climate systems built for Arizona heat.",
  },
  {
    title: "Electrical License",
    detail: "ROC #350715",
    description: "Licensed electricians on every project. No outside subs needed.",
  },
  {
    title: "Plumbing License",
    detail: "ROC #350716",
    description: "From fixture swaps to full re-pipes, all done in-house.",
  },
];

const values = [
  {
    title: "Craftsmanship First",
    description:
      "We never cut corners. Every joint, every seam, every finish is executed to the highest standard.",
  },
  {
    title: "Client Partnership",
    description:
      "Your home, your vision. We listen first, advise second, and build exactly what you want.",
  },
  {
    title: "Local Expertise",
    description:
      "We know Scottsdale's HOA requirements, permit processes, and architectural styles inside and out.",
  },
];

const serviceAreas = [
  "McCormick Ranch · 85258",
  "Gainey Ranch · 85258",
  "Paradise Valley · 85253",
  "Pinnacle Peak CC · 85255",
];

const goldBtn =
  "inline-block rounded-[2px] bg-gold px-[34px] py-[15px] text-[12px] font-semibold uppercase tracking-[0.1em] text-teal-dark no-underline transition-all hover:-translate-y-px hover:bg-[#d4a94c] hover:shadow-[0_10px_34px_rgba(200,165,90,0.28)]";

const lineBtn =
  "inline-flex items-center gap-2 rounded-[2px] border border-off-white/25 px-[26px] py-[14px] text-[12px] font-medium uppercase tracking-[0.08em] text-off-white/80 no-underline transition-colors hover:border-gold hover:text-gold";

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: EASE, delay },
  }),
};

export default function AboutContent() {
  const prefersReducedMotion = useReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";
  const viewport = { once: true, margin: "-36px" } as const;

  return (
    <>
      <PageHero
        label="About Us"
        title="Our Story"
        description="Built on a foundation of integrity, quality, and a deep love for transforming Scottsdale homes."
        linework={
          <WallSection className="ml-auto block h-auto w-full max-w-[440px]" glow />
        }
      />

      {/* Story — dark page ground, the blueprint grid shows through */}
      <section
        className="relative pb-[clamp(80px,10vh,120px)] pt-[clamp(56px,8vh,96px)]"
        aria-label="Our story"
      >
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <div className="grid gap-[clamp(44px,6vw,100px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <motion.div
                variants={revealVariants}
                initial={initial}
                whileInView="visible"
                viewport={viewport}
              >
                <span className="section-label !mb-0">Heritage</span>
                <h2 className="mt-5 max-w-[11em] font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
                  Where Craftsmanship Meets{" "}
                  <em className="font-normal italic text-gold">Character</em>
                </h2>
              </motion.div>
              <motion.div
                variants={revealVariants}
                custom={0.12}
                initial={initial}
                whileInView="visible"
                viewport={viewport}
              >
                <p className="mt-7 max-w-[540px] text-[15.5px] leading-[1.8] text-off-white/70">
                  Saddlewood Contracting was founded with a simple belief:
                  homeowners in Scottsdale&apos;s finest neighborhoods deserve a
                  contractor who treats their home with the same care and
                  attention to detail as if it were their&nbsp;own.
                </p>
                <p className="mt-5 max-w-[540px] text-[15.5px] leading-[1.8] text-off-white/70">
                  What sets us apart is our ability to handle every aspect of
                  your remodel{" "}
                  <span className="whitespace-nowrap">in-house</span>. With four
                  active ROC licenses in General, HVAC, Electrical, and
                  Plumbing, we eliminate the coordination headaches that come
                  with managing multiple&nbsp;subcontractors.
                </p>
                <p className="mt-5 max-w-[540px] text-[15.5px] leading-[1.8] text-off-white/70">
                  We specialize in the communities we know best: McCormick
                  Ranch, Gainey Ranch, Paradise Valley, and Pinnacle Peak
                  Country Club. This hyper-local focus means we understand the
                  architectural styles, HOA requirements, and design
                  preferences that make each neighborhood unique.
                </p>
                <div className="mt-9 text-[11px] font-medium uppercase tracking-[0.25em] text-gold">
                  Est. 2007 · Licensed, Bonded &amp; Insured
                </div>
              </motion.div>
            </div>

            {/* Values rail — gold hairlines in place of the old project photo */}
            <motion.div
              variants={revealVariants}
              custom={0.18}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <span className="section-label !mb-0">Values</span>
              <h3 className="mt-5 font-heading text-[clamp(24px,2.4vw,32px)] font-medium leading-[1.2] tracking-[-0.02em] text-off-white">
                What Drives Us
              </h3>
              <div className="mt-7 flex flex-col border-t border-gold/[0.35]">
                {values.map((value) => (
                  <div
                    key={value.title}
                    className="flex flex-1 flex-col justify-center border-b border-gold/[0.35] py-6"
                  >
                    <h4 className="font-heading text-[21px] font-medium leading-[1.3] text-off-white">
                      {value.title}
                    </h4>
                    <p className="mt-2 text-[13.5px] leading-[1.7] text-off-white/[0.62]">
                      {value.description}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Credentials — numbered license plates in the services-grid frame */}
      <section
        className="relative pb-[clamp(90px,11vh,140px)]"
        aria-label="Credentials"
      >
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <motion.div
            variants={revealVariants}
            initial={initial}
            whileInView="visible"
            viewport={viewport}
          >
            <BlueprintDivider className="mb-10 block h-[24px] w-[180px]" />
            <span className="section-label !mb-0">Credentials</span>
            <h2 className="mt-6 font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
              Licensed, Bonded &amp;{" "}
              <em className="font-normal italic text-gold">Insured</em>
            </h2>
          </motion.div>

          <div className="mt-[clamp(40px,6vh,64px)] grid grid-cols-1 gap-px border border-off-white/[0.12] bg-off-white/[0.12] sm:grid-cols-2 lg:grid-cols-4">
            {credentials.map((c, i) => (
              <motion.div
                key={c.title}
                className="h-full"
                variants={revealVariants}
                custom={i * 0.1}
                initial={initial}
                whileInView="visible"
                viewport={viewport}
              >
                <div className="flex h-full flex-col bg-teal-dark p-7 lg:p-9">
                  <div className="mb-5 text-[10.5px] font-medium tracking-[0.25em] text-gold">
                    {c.detail}
                  </div>
                  <h3 className="font-heading text-[19px] font-medium leading-[1.3] text-off-white">
                    {c.title}
                  </h3>
                  <p className="mt-3 text-[13.5px] leading-[1.7] text-off-white/[0.62]">
                    {c.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Verified on the Procore Network */}
          <motion.div
            className="mt-[clamp(44px,6vh,64px)] flex flex-col items-center gap-4"
            variants={revealVariants}
            custom={0.1}
            initial={initial}
            whileInView="visible"
            viewport={viewport}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-off-white/65">
              Verified on the Procore Network
            </p>
            <ProcoreBadge width={168} />
          </motion.div>
        </div>
      </section>

      {/* Service area — teal band with gold hairlines, CTA close */}
      <section
        className="relative overflow-hidden border-y border-gold/[0.22] bg-teal py-[clamp(80px,10vh,120px)]"
        aria-label="Service area"
      >
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 55% 70% at 50% 50%, rgba(200,165,90,0.10), transparent 70%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <motion.div
            variants={revealVariants}
            initial={initial}
            whileInView="visible"
            viewport={viewport}
          >
            <span className="section-label !mb-0">Service Area</span>
            <h2 className="mt-6 font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-off-white">
              Proudly Serving{" "}
              <em className="font-normal italic text-gold">Scottsdale</em>
            </h2>
            <p className="mt-6 max-w-[560px] text-[15.5px] leading-[1.8] text-off-white/[0.68]">
              Our hyper-local focus means deeper expertise and stronger
              relationships in the communities where we work.
            </p>
            <div className="mt-12 grid max-w-[1000px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {serviceAreas.map((area) => (
                <div
                  key={area}
                  className="rounded-[2px] border border-gold/[0.3] bg-off-white/[0.04] px-6 py-4"
                >
                  <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-off-white/85">
                    {area}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Link href="/contact" className={goldBtn}>
                Schedule Consultation
              </Link>
              <a href="tel:4809996100" className={lineBtn}>
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                (480) 999-6100
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
