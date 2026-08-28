import type { Metadata } from "next";
import { HeroSection } from "@/components/HeroSection";
import { SameHouseSection } from "@/components/SameHouseSection";
import { PlanBuildAim } from "@/components/PlanBuildAim";
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
 * Homepage, Hero V2 composition (2026-08-28): full-bleed video hero (media)
 * → cream working-set elevation → plan/build/aim trio (deep) → canopy
 * transition band (media) → kitchen pair (cream) → framing pair (deep) →
 * neighborhood ledger (cream) → CTA (deep band). Ground rhythm rule: no two
 * adjacent sections share a ground; video counts as its own ground.
 */
export default function Home() {
  return (
    <>
      <HeroSection />
      <SameHouseSection />
      <PlanBuildAim />
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
