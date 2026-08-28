"use client";

/**
 * Cream interlude — the one light section in the Night Blueprint homepage
 * rhythm. Heritage copy and the three values, sourced from the About page.
 * On cream, small gold type uses --gold-accessible and display accents use
 * --gold-display (full-strength #c8a55a is reserved for dark grounds).
 */

import { motion, useReducedMotion, type Variants } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

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

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: EASE, delay },
  }),
};

export function HeritageInterlude() {
  const prefersReducedMotion = useReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";
  const viewport = { once: true, margin: "-36px" } as const;

  return (
    <section
      className="night-on-cream relative border-t border-gold/[0.35] bg-off-white pb-[clamp(72px,9vh,100px)] pt-[clamp(88px,11vh,128px)] text-charcoal"
      aria-label="Our story"
    >
      <div className="night-cream-grid" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        <div className="grid gap-[clamp(44px,6vw,100px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <motion.div
              variants={revealVariants}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <span className="section-label !mb-0">Heritage</span>
              <h2 className="mb-7 mt-5 max-w-[11em] font-heading text-[clamp(34px,4vw,56px)] font-medium leading-[1.15] tracking-[-0.02em] text-charcoal">
                Where Craftsmanship Meets{" "}
                <em className="font-normal italic text-gold-display">
                  Character
                </em>
              </h2>
            </motion.div>
            <motion.div
              variants={revealVariants}
              custom={0.12}
              initial={initial}
              whileInView="visible"
              viewport={viewport}
            >
              <p className="max-w-[540px] text-[15.5px] leading-[1.8] text-charcoal-light">
                Saddlewood Contracting was founded with a simple belief:
                homeowners in Scottsdale&apos;s finest neighborhoods deserve a
                contractor who treats their home with the same care and
                attention to detail as if it were their&nbsp;own.
              </p>
              <p className="mt-5 max-w-[540px] text-[15.5px] leading-[1.8] text-charcoal-light">
                What sets us apart is our ability to handle every aspect of
                your project{" "}
                <span className="whitespace-nowrap">in-house</span>. With four
                active ROC licenses in General, HVAC, Electrical, and
                Plumbing, we eliminate the coordination headaches that come
                with managing multiple&nbsp;subcontractors.
              </p>
              <div className="mt-9 text-[11px] font-medium uppercase tracking-[0.25em] text-gold-accessible">
                Est. 2007 · Licensed, Bonded &amp; Insured
              </div>
            </motion.div>
          </div>

          <motion.div
            className="flex flex-col border-t border-gold/50"
            variants={revealVariants}
            custom={0.18}
            initial={initial}
            whileInView="visible"
            viewport={viewport}
          >
            {values.map((value) => (
              <div
                key={value.title}
                className="flex flex-1 flex-col justify-center border-b border-gold/50 py-6"
              >
                <h3 className="font-heading text-[21px] font-medium leading-[1.3] text-teal">
                  {value.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-[1.7] text-charcoal-light">
                  {value.description}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
