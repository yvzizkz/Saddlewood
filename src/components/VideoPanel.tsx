"use client";

/**
 * Fill-parent looping video panel — for media slots inside SheetPair panels
 * and transition bands where the 9:16 VideoReel frame doesn't fit. Muted
 * autoplay loop (playsinline), playing only while visible. Reduced motion
 * shows the poster frame instead of moving footage.
 */

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

interface VideoPanelProps {
  src: string;
  poster: string;
  /** Accessible description of the footage. */
  label: string;
  className?: string;
}

export function VideoPanel({ src, poster, label, className }: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play().catch(() => {
              /* autoplay interruptions are fine */
            });
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.35 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  if (prefersReducedMotion) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- poster frame, no optimization needed
      <img
        src={poster}
        alt={label}
        className={className ?? "absolute inset-0 h-full w-full object-cover"}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      aria-label={label}
      className={className ?? "absolute inset-0 h-full w-full object-cover"}
      muted
      loop
      playsInline
      preload="none"
    />
  );
}
