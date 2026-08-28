"use client";

/**
 * Stat count-up: server-renders the target number (correct without JS),
 * then animates 0 → value once 60% visible (rAF, cubic ease-out, 900ms),
 * writing textContent imperatively like the handoff demo so React state
 * never churns. Under prefers-reduced-motion the number simply shows.
 */

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

interface CountUpProps {
  value: number;
  className?: string;
}

export function CountUp({ value, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // The real value stays rendered through SSR and hydration (no flash of
  // "0"); the count-up only kicks in at the moment the stat scrolls into
  // view, animating 0 -> value in one gesture.
  useEffect(() => {
    if (prefersReducedMotion) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.disconnect();
          let start: number | null = null;
          const step = (t: number) => {
            if (start === null) start = t;
            const p = Math.min((t - start) / 900, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = String(Math.round(value * eased));
            if (p < 1) raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
        });
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = String(value);
    };
  }, [prefersReducedMotion, value]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
