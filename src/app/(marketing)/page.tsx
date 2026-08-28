import type { Metadata } from "next";
import { HeroSection } from "@/components/HeroSection";
import { IntroStrip } from "@/components/IntroStrip";
import { SameHouseSection } from "@/components/SameHouseSection";
import { PlanBuildAim } from "@/components/PlanBuildAim";
import {
  KitchenPairSection,
  FramingPairSection,
} from "@/components/HomeServicePairs";
import { NeighborhoodLedger } from "@/components/NeighborhoodLedger";
import { CTABanner } from "@/components/CTABanner";

export const metadata: Metadata = {
  // Self-canonical for the homepage. Relative "/" resolves against the
  // metadataBase set in the marketing layout.
  alternates: { canonical: "/" },
};

/**
 * Homepage, handoff composition (2026-08-28): live hero reel → stats band →
 * cream working-set elevation → plan/build/aim trio → kitchen pair (cream) →
 * framing pair (dark) → neighborhood ledger → CTA. Grounds alternate; the
 * only photography is the delivered steel/render/kitchen set and the reels.
 */
export default function Home() {
  return (
    <>
      <HeroSection />
      <IntroStrip />
      <SameHouseSection />
      <PlanBuildAim />
      <KitchenPairSection />
      <FramingPairSection />
      <NeighborhoodLedger />
      <CTABanner />
    </>
  );
}
