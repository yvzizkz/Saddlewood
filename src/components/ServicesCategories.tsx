"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

/**
 * ServicesCategories
 *
 * Four core services — Kitchen, Bathroom, Whole-Home, Outdoor Living.
 * Editorial alternating layout: each service gets a strong hero image
 * paired with a short scope line and a quiet link to relevant work.
 *
 * Copy is deliberately minimal. The image carries the message; the
 * single line of scope provides specifics for visitors who want them.
 */

interface ServiceCategory {
  /** Service name, e.g. "Kitchen" */
  name: string;
  /** One-line summary of what's in scope — direct, no buzzwords */
  scope: string;
  /** Single hero image — should be the strongest example we have */
  image: string;
  imageAlt: string;
  /** Where to send visitors who want to see more (portfolio or case study) */
  href: string;
  /** Friendly link label */
  hrefLabel: string;
}

interface ServicesCategoriesProps {
  categories: ServiceCategory[];
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

export function ServicesCategories({ categories }: ServicesCategoriesProps) {
  const prefersReducedMotion = useReducedMotion();
  const initial = prefersReducedMotion ? "visible" : "hidden";

  return (
    <section className="bg-cream py-24 sm:py-28 lg:py-36" aria-label="Core services">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
        {/* Section intro */}
        <motion.div
          variants={fadeUp}
          initial={initial}
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          className="max-w-[720px] mb-16 sm:mb-20 lg:mb-24"
        >
          <div className="section-label">What We Build</div>
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-[52px] font-light text-charcoal leading-[1.1] tracking-[-0.02em] mt-2">
            Four scopes. One in-house team.
          </h2>
        </motion.div>

        {/* Alternating service rows */}
        <div className="space-y-20 sm:space-y-24 lg:space-y-32">
          {categories.map((cat, i) => {
            const reverse = i % 2 === 1;
            return (
              <motion.article
                key={cat.name}
                variants={fadeUp}
                initial={initial}
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 lg:gap-16 items-center"
              >
                {/* Image */}
                <div
                  className={`lg:col-span-7 ${
                    reverse ? "lg:order-2" : "lg:order-1"
                  }`}
                >
                  <div className="relative aspect-[5/4] overflow-hidden bg-stone">
                    <Image
                      src={cat.image}
                      alt={cat.imageAlt}
                      fill
                      loading="lazy"
                      sizes="(min-width: 1024px) 58vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                </div>

                {/* Text */}
                <div
                  className={`lg:col-span-5 ${
                    reverse ? "lg:order-1 lg:pr-8" : "lg:order-2 lg:pl-8"
                  }`}
                >
                  <div className="text-[11px] tracking-[0.25em] uppercase text-gold-accessible font-medium mb-4">
                    0{i + 1}
                  </div>
                  <h3 className="font-heading text-3xl sm:text-4xl lg:text-[44px] font-light text-charcoal leading-[1.1] tracking-[-0.01em] mb-6">
                    {cat.name}
                  </h3>
                  <p className="text-[15px] sm:text-base text-charcoal-light font-light leading-relaxed mb-8 max-w-[420px]">
                    {cat.scope}
                  </p>
                  <Link
                    href={cat.href}
                    className="inline-flex items-center gap-2 text-sm text-charcoal hover:text-gold-accessible transition-colors tracking-wide border-b border-charcoal/20 hover:border-gold-accessible pb-1"
                  >
                    {cat.hrefLabel}{" "}
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
