"use client";

/**
 * Left-to-right clip-path reveal for the few real photographs on the site
 * (steel framing, renders, the kitchen "Delivered" panel), per the handoff
 * demo's `.wipe` spec: inset(0 100% 0 0) → inset(0), 1.1s on a hard-in
 * soft-out ease, 0.15s delay. Reduced motion shows the image immediately.
 *
 * A pure variant child (hidden/visible): the wipe MUST sit inside a
 * variants-driven reveal parent that observes the viewport (SheetPair
 * panels, PlanBuildAim beats). A nested whileInView of its own does not
 * reliably fire inside those parents, so this component deliberately
 * carries no observer, exactly like the linework Stroke primitives.
 */

import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

const WIPE_EASE = [0.6, 0.05, 0.2, 1] as const;

const wipeVariants: Variants = {
  hidden: { clipPath: "inset(0% 100% 0% 0%)" },
  visible: {
    clipPath: "inset(0% 0% 0% 0%)",
    transition: { duration: 1.1, ease: WIPE_EASE, delay: 0.15 },
  },
};

interface PhotoWipeProps {
  src: string;
  alt: string;
  /** Fills its positioned parent (object-cover), like the demo panels. */
  sizes?: string;
  className?: string;
}

export function PhotoWipe({ src, alt, sizes = "(max-width: 900px) 100vw, 40vw", className }: PhotoWipeProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (prefersReducedMotion) {
    return (
      <div className={className ?? "absolute inset-0"}>
        <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
      </div>
    );
  }

  return (
    <motion.div className={className ?? "absolute inset-0"} variants={wipeVariants}>
      {/* Eager: a clipped-to-zero image never intersects for native lazy
          loading, which would leave the wipe revealing an empty panel. */}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        loading="eager"
        className="object-cover"
      />
    </motion.div>
  );
}
