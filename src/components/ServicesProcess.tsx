"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

/**
 * ServicesProcess
 *
 * Centerpiece section of the Services page. Pairs the six construction
 * phases of the 40th Street whole-home build with finished interiors from
 * the same Paradise Valley project. The narrative the visitor reads, even
 * without copy: "we built this house from the ground up — every trade
 * in-house — here is the proof in pictures."
 *
 * Layout: vertical sequence of paired rows. Each row has the construction
 * photo on one side and a complementary finished image on the other,
 * alternating left/right down the page. Phase numerals and small labels
 * sit between the two images. Final row is a single widescreen finished
 * hero — the "and here it is" payoff.
 */

interface PairedPhase {
  /** Phase numeral, e.g. "01" */
  number: string;
  /** Phase label drawn from project data */
  label: string;
  /** Construction-stage image */
  duringSrc: string;
  duringAlt: string;
  /** Finished image that pairs with this phase */
  finishedSrc: string;
  finishedAlt: string;
  /** Finished caption — single descriptive line, no marketing voice */
  finishedCaption: string;
}

interface ServicesProcessProps {
  pairs: PairedPhase[];
  /** Final widescreen finished hero — the payoff after the sequence */
  finalHero: {
    src: string;
    alt: string;
    caption: string;
  };
}

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, ease: EASE },
  },
};

export function ServicesProcess({ pairs, finalHero }: ServicesProcessProps) {
  const prefersReducedMotion = useReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";

  return (
    <section className="bg-off-white py-24 sm:py-28 lg:py-36" aria-label="From construction to finished home">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
        {/* Section intro — quiet, editorial */}
        <motion.div
          variants={fadeUp}
          initial={initial}
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          className="max-w-[720px] mb-20 sm:mb-24 lg:mb-32"
        >
          <div className="section-label">From Demo to Finish</div>
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-[52px] font-light text-charcoal leading-[1.1] tracking-[-0.02em] mt-2">
            One project. Every trade.{" "}
            <em className="italic text-teal font-normal">Start to finish.</em>
          </h2>
          <p className="mt-7 text-[15px] sm:text-base text-charcoal-light font-light leading-relaxed max-w-[560px]">
            A Paradise Valley whole-home build, from the day we broke ground to
            the day the homeowner moved in. General, electrical, plumbing, and
            HVAC — all our own crew, all four ROC licenses on the same job site.
          </p>
        </motion.div>

        {/* Paired phases */}
        <ol className="space-y-20 sm:space-y-28 lg:space-y-36" role="list">
          {pairs.map((pair, i) => {
            const reverse = i % 2 === 1;
            return (
              <motion.li
                key={pair.duringSrc}
                variants={fadeUp}
                initial={initial}
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10 lg:gap-12 items-center"
              >
                {/* During — construction photo */}
                <figure
                  className={`lg:col-span-6 ${
                    reverse ? "lg:order-2" : "lg:order-1"
                  }`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-stone">
                    <Image
                      src={pair.duringSrc}
                      alt={pair.duringAlt}
                      fill
                      loading="lazy"
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <figcaption className="mt-4 flex items-baseline gap-4">
                    <span className="font-heading text-2xl sm:text-3xl text-gold-accessible font-light leading-none">
                      {pair.number}
                    </span>
                    <span className="text-[12px] sm:text-[13px] tracking-[0.18em] uppercase text-charcoal font-medium">
                      {pair.label}
                    </span>
                  </figcaption>
                </figure>

                {/* Finished — pairing room from the same project */}
                <figure
                  className={`lg:col-span-6 ${
                    reverse ? "lg:order-1" : "lg:order-2"
                  }`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-stone">
                    <Image
                      src={pair.finishedSrc}
                      alt={pair.finishedAlt}
                      fill
                      loading="lazy"
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <figcaption className="mt-4 flex items-baseline gap-4">
                    <span className="text-[11px] tracking-[0.25em] uppercase text-charcoal-light font-medium">
                      Finished
                    </span>
                    <span className="text-[13px] sm:text-sm text-charcoal-light font-light leading-snug">
                      {pair.finishedCaption}
                    </span>
                  </figcaption>
                </figure>
              </motion.li>
            );
          })}
        </ol>

        {/* Final hero — the payoff */}
        <motion.figure
          variants={fadeUp}
          initial={initial}
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-20 sm:mt-28 lg:mt-36"
        >
          <div className="relative aspect-[16/9] overflow-hidden bg-stone">
            <Image
              src={finalHero.src}
              alt={finalHero.alt}
              fill
              loading="lazy"
              sizes="100vw"
              className="object-cover"
            />
          </div>
          <figcaption className="mt-6 sm:mt-8 max-w-[720px]">
            <span className="text-[11px] tracking-[0.25em] uppercase text-gold-accessible font-medium">
              The result
            </span>
            <p className="mt-3 font-heading text-xl sm:text-2xl lg:text-[28px] font-light text-charcoal leading-[1.4] italic">
              {finalHero.caption}
            </p>
            <Link
              href="/portfolio/paradise-valley-40th-street-whole-home-build"
              className="mt-6 inline-flex items-center gap-2 text-sm text-charcoal hover:text-gold-accessible transition-colors tracking-wide"
            >
              See the full project{" "}
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </figcaption>
        </motion.figure>
      </div>
    </section>
  );
}
