"use client";

/**
 * Drawing-to-render sweep (owner request, 2026-08-28): the garage-side
 * elevation sheet auto-wipes sideways into the client-approved rendering
 * of the same view, then sweeps back. A gold divider tracks the seam;
 * both sides carry truth chips and the rendering keeps its mandatory
 * caption. The sheet still draws itself on first view before the sweep
 * begins (the CSS animation is delayed past the draw). Reduced motion
 * shows a static split.
 */

import Image from "next/image";
import { GarageElevation } from "@/components/linework";

export function DrawingToRender() {
  return (
    <div className="relative mt-11 w-full overflow-hidden border border-stone-mid">
      {/* Sizing frame */}
      <div className="relative aspect-[16/9] max-h-[560px] w-full sm:aspect-[2.1/1]">
        {/* Bottom layer: the rendering (revealed by the sweep) */}
        <Image
          src="/images/render-garage-wide.jpg"
          alt="Rendering of the garage side of the estate in progress in Paradise Valley"
          fill
          sizes="(max-width: 1280px) 100vw, 1240px"
          className="object-cover"
        />

        {/* Top layer: the drafted sheet on paper, clipped by the sweep */}
        <div className="sheet-wipe-layer linework-ink absolute inset-0 flex items-center bg-[#faf6ea] px-6 py-8">
          <GarageElevation className="mx-auto block h-auto max-h-full w-full max-w-[960px]" />
        </div>

        {/* Divider tracking the seam */}
        <div
          className="sheet-wipe-divider pointer-events-none absolute inset-y-0 w-[2px] bg-gold shadow-[0_0_18px_rgba(200,165,90,0.65)]"
          aria-hidden="true"
        />

        {/* Truth chips */}
        <span className="absolute right-3.5 top-3.5 z-[2] border border-stone-mid bg-off-white/90 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-gold-accessible">
          Drawn
        </span>
        <span className="absolute bottom-3.5 left-3.5 z-[2] border border-gold/[0.35] bg-teal-dark/80 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-gold">
          Rendering · Estate in progress, Paradise Valley
        </span>
      </div>
    </div>
  );
}
