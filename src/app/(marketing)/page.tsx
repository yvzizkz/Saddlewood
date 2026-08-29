import type { Metadata } from "next";
import { HeroSection } from "@/components/HeroSection";
import { BuildSequence } from "@/components/BuildSequence";
import { CrewCycle } from "@/components/CrewCycle";
import {
  FullScopeSection,
  FramingPairSection,
} from "@/components/HomeServicePairs";
import { LicenseLedger } from "@/components/LicenseLedger";
import { NeighborhoodLedger } from "@/components/NeighborhoodLedger";
import { CTABanner } from "@/components/CTABanner";

export const metadata: Metadata = {
  // Self-canonical for the homepage. Relative "/" resolves against the
  // metadataBase set in the marketing layout.
  alternates: { canonical: "/" },
};

/**
 * Homepage composition (2026-08-28): full-bleed video hero landing on the
 * mark (media) → build sequence, chalk to crew (cream) → crew cycle, one
 * long pass ending on the rendering (media) → full scope (cream) → framing
 * pair (deep) → license ledger (deep, hairline-bounded credential strip) →
 * neighborhood ledger (cream) → CTA (deep band). Ground rhythm rule: no two
 * adjacent sections share a ground; video counts as its own, and the
 * credential strip is a rule-bounded device rather than a section in the
 * same key as the framing pair above it.
 *
 * The crew cycle took over the transition band's slot and the build
 * sequence's rendering payoff: both showed where the build lands, and the
 * band said less while taking the better position.
 */
export default function Home() {
  return (
    <>
      <HeroSection />
      <BuildSequence />
      <CrewCycle />
      <FullScopeSection />
      <FramingPairSection />
      <LicenseLedger />
      <NeighborhoodLedger />
      <CTABanner />
    </>
  );
}
