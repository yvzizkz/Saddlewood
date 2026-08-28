"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoReelProps {
  src: string;            // e.g. "/videos/breaking-ground-steel-9x16.mp4"
  poster: string;         // e.g. "/videos/breaking-ground-steel-9x16-poster.jpg"
  label: string;          // aria-label / context, e.g. "framing on site in Paradise Valley"
  aspect: "9x16" | "16x9" | "1x1";
  mode?: "autoloop" | "clickToPlay";  // default "autoloop"
  /** Video preload hint. Above-the-fold reels (hero) pass "metadata". */
  preload?: "none" | "metadata" | "auto";
  className?: string;
}

const aspectClasses = {
  "9x16": "aspect-[9/16]",
  "16x9": "aspect-video",
  "1x1": "aspect-square",
};

export function VideoReel({
  src,
  poster,
  label,
  aspect,
  mode = "autoloop",
  preload = "none",
  className,
}: VideoReelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [hasClickedPlay, setHasClickedPlay] = useState(false);

  useEffect(() => {
    if (mode !== "autoloop" || prefersReducedMotion) return;

    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play().catch((err) => {
              // Ignore play interruptions or aborts
              console.warn("Autoplay failed or interrupted:", err);
            });
          } else {
            video.pause();
          }
        });
      },
      {
        threshold: 0.4, // ≥ ~40% visible
      }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, [mode, prefersReducedMotion]);

  const handlePlayClick = () => {
    setHasClickedPlay(true);
    const video = videoRef.current;
    if (video) {
      video.preload = "auto";
      video.load();
      video.play().catch((err) => {
        console.error("Click to play failed:", err);
      });
    }
  };

  // Determine if controls should be visible
  const showControls =
    (mode === "autoloop" && prefersReducedMotion) ||
    (mode === "clickToPlay" && hasClickedPlay);

  // Determine if we should show the play button overlay
  const showPlayButton = mode === "clickToPlay" && !hasClickedPlay;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-stone rounded-sm",
        aspectClasses[aspect],
        className
      )}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        aria-label={label}
        className="w-full h-full object-cover"
        playsInline
        muted={mode === "autoloop" && !prefersReducedMotion}
        loop={mode === "autoloop"}
        preload={preload}
        controls={showControls}
      />

      {showPlayButton && (
        <button
          onClick={handlePlayClick}
          className="absolute inset-0 flex items-center justify-center bg-teal-dark/20 hover:bg-teal-dark/30 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          aria-label={`Play video: ${label}`}
        >
          <div className="w-16 h-16 rounded-full bg-cream/90 backdrop-blur-sm flex items-center justify-center text-teal group-hover:scale-110 group-hover:bg-gold group-hover:text-teal-dark transition-all duration-300 shadow-lg">
            <Play className="w-6 h-6 fill-current translate-x-0.5" />
          </div>
        </button>
      )}
    </div>
  );
}
