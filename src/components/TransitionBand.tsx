"use client";

/**
 * Full-width transition band — a muted video strip between homepage
 * sections (round-2 directive), with a dark gradient scrim and a single
 * mono eyebrow line. Wire two of these into the homepage (band A after the
 * elevation section, band B before Service Area) once the round-2 media
 * pack's band videos are placed in /public/videos.
 *
 * <video muted autoplay playsinline>: one slow pass on first view, then it
 * rests on its closing frame behind a Replay control. Reduced motion shows
 * the poster frame.
 */

import { VideoPanel } from "@/components/VideoPanel";
import { GrainOverlay } from "@/components/GrainOverlay";

interface TransitionBandProps {
  src: string;
  poster: string;
  /** One mono eyebrow line over the footage, e.g. "Filmed on site · Paradise Valley". */
  eyebrow: string;
  /** Accessible description of the footage. */
  label: string;
}

export function TransitionBand({ src, poster, eyebrow, label }: TransitionBandProps) {
  return (
    <section
      className="relative h-[clamp(240px,36vh,420px)] overflow-hidden"
      aria-label={label}
    >
      <VideoPanel
        src={src}
        poster={poster}
        label={label}
        replay
        replayClassName="right-5 top-5 sm:right-8"
      />
      {/* Scrim: hold the night ground at the edges so the band reads as part
          of the page, not a break in it. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(to bottom, rgba(26,47,47,0.82), rgba(26,47,47,0.25) 35%, rgba(26,47,47,0.25) 65%, rgba(26,47,47,0.82)), linear-gradient(rgba(26,47,47,0.15), rgba(26,47,47,0.15))",
        }}
      />
      <GrainOverlay />
      <span className="absolute bottom-6 left-5 z-[1] inline-flex items-center gap-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold sm:left-8">
        <span className="h-px w-8 bg-gold" aria-hidden="true" />
        {eyebrow}
      </span>
    </section>
  );
}
