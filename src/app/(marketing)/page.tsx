import type { Metadata } from "next";
import { HeroSection } from "@/components/HeroSection";
import { BuildSequence } from "@/components/BuildSequence";
import {
  KitchenPairSection,
  FramingPairSection,
} from "@/components/HomeServicePairs";
import { NeighborhoodLedger } from "@/components/NeighborhoodLedger";
import { TransitionBand } from "@/components/TransitionBand";
import { CTABanner } from "@/components/CTABanner";

export const metadata: Metadata = {
  // Self-canonical for the homepage. Relative "/" resolves against the
  // metadataBase set in the marketing layout.
  alternates: { canonical: "/" },
};

/**
 * Homepage, Hero V3 composition (2026-08-28): full-bleed video hero landing
 * on the mark (media) → build sequence, layout to rendering (cream) →
 * canopy transition band (media) → kitchen pair (cream) → framing pair
 * (deep) → neighborhood ledger (cream) → CTA (deep band). Ground rhythm
 * rule: no two adjacent sections share a ground; video counts as its own.
 *
 * The build sequence replaces the traced working-set section and the
 * plan/build/aim trio: both argued the same thing, one of them with a
 * drawing instead of the build.
 */
export default function Home() {
  return (
    <>
      <HeroSection />
      <BuildSequence />
      <TransitionBand
        src="/videos/saddlewood-transition-band.mp4"
        poster="/videos/saddlewood-transition-band-poster.jpg"
        eyebrow="Self-Performed · Paradise Valley"
        label="Aerial of the steel-deck canopy and crew on the active Paradise Valley build"
      />
      <KitchenPairSection />
      <FramingPairSection />
      <NeighborhoodLedger />
      <CTABanner />
    </>
  );
}
