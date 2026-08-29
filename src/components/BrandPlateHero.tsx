"use client";

/**
 * Brand plate hero — the still the homepage animation lands on, reused as the
 * opening frame of the pages that have no job-site footage of their own
 * (Contact, Trade Partners). The homepage hero ends here; these pages begin
 * here, so the mark reads as the same moment held.
 *
 * The plate is a generated dusk study, so it carries the standing caption and
 * is never presented as project photography. The roundel is the brand mark
 * knocked out to white, resolving over it rather than sitting flat.
 */

import type { ReactNode } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { FullBleedHero } from "@/components/FullBleedHero";

const EASE = [0.22, 1, 0.36, 1] as const;

interface BrandPlateHeroProps {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  children?: ReactNode;
  minHeightClass?: string;
}

export function BrandPlateHero({
  eyebrow,
  title,
  description,
  children,
  minHeightClass,
}: BrandPlateHeroProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <FullBleedHero
      media={{
        kind: "image",
        src: "/images/hero-finale-dusk.jpg",
        alt: "",
        positionClass: "object-[50%_42%]",
      }}
      label="Dusk over the Scottsdale foothills with the Saddlewood mark"
      mediaCaption="Dusk study · Scottsdale foothills"
      eyebrow={eyebrow}
      title={title}
      description={description}
      minHeightClass={minHeightClass}
      overlay={
        <div className="absolute right-[8%] top-[30%] w-[38%] max-w-[280px] opacity-[0.32] sm:right-[10%] sm:top-[26%] sm:w-[19%] sm:opacity-[0.92]">
          <motion.div
            className="[filter:drop-shadow(0_2px_18px_rgba(26,47,47,0.5))]"
            initial={
              prefersReducedMotion
                ? { opacity: 1, scale: 1 }
                : { opacity: 0, scale: 0.86 }
            }
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2, ease: EASE, delay: 0.35 }}
          >
            <Image
              src="/images/logo-roundel-white.png"
              alt=""
              width={300}
              height={300}
              className="h-auto w-full"
            />
          </motion.div>
        </div>
      }
    >
      {children}
    </FullBleedHero>
  );
}
