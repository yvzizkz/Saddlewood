"use client";

/**
 * Fill-parent ambient video panel — for media slots inside SheetPair panels,
 * transition bands and full-bleed heroes where the 9:16 VideoReel frame
 * doesn't fit. Muted, playsinline, no controls.
 *
 * Playback (owner direction, 2026-08-28: "should they only play on first
 * load"): the default `once` mode plays a single pass the first time the
 * panel scrolls into view, then rests on its closing frame — the page
 * settles instead of churning. Scrolling away mid-pass pauses it; coming
 * back resumes the same pass. Large surfaces pass `replay` for a quiet
 * control that runs it again on demand. `loop` stays available for slots
 * that genuinely need continuous motion.
 *
 * Reduced motion shows the poster frame instead of moving footage.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

interface VideoPanelProps {
  src: string;
  poster: string;
  /** Accessible description of the footage. */
  label: string;
  className?: string;
  /** "once" (default) plays one pass, then holds the closing frame. */
  mode?: "once" | "loop";
  /** Show the resting Replay control — for heroes and bands with room for it. */
  replay?: boolean;
  /** Position utilities for that control. */
  replayClassName?: string;
  preload?: "none" | "metadata" | "auto";
}

export function VideoPanel({
  src,
  poster,
  label,
  className,
  mode = "once",
  replay = false,
  replayClassName = "right-5 top-[106px] sm:right-8",
  preload = "none",
}: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [atRest, setAtRest] = useState(false);
  // The observer callback closes over its first render, so the "has this
  // finished its pass" flag has to live in a ref, not state.
  const atRestRef = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (atRestRef.current) return;
            video.play().catch(() => {
              /* autoplay interruptions are fine */
            });
          } else {
            video.pause();
          }
        });
      },
      // Start the pass slightly before the panel is centred so the opening
      // seconds aren't spent off-screen — it only gets one.
      { threshold: 0.2, rootMargin: "10% 0px" }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  const handleEnded = useCallback(() => {
    if (mode !== "once") return;
    atRestRef.current = true;
    setAtRest(true);
  }, [mode]);

  const handleReplay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    atRestRef.current = false;
    setAtRest(false);
    video.currentTime = 0;
    video.play().catch(() => {
      /* autoplay interruptions are fine */
    });
  }, []);

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
    <>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        aria-label={label}
        className={className ?? "absolute inset-0 h-full w-full object-cover"}
        muted
        loop={mode === "loop"}
        playsInline
        preload={preload}
        onEnded={handleEnded}
      />
      {replay && atRest ? (
        <button
          type="button"
          onClick={handleReplay}
          aria-label={`Replay: ${label}`}
          className={`absolute z-[2] inline-flex items-center gap-2 rounded-[2px] border border-off-white/25 bg-teal-dark/45 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-off-white/70 backdrop-blur-[2px] transition-colors hover:border-gold hover:text-gold focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-gold ${replayClassName}`}
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Replay
        </button>
      ) : null}
    </>
  );
}
