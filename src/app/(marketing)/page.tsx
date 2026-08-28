import type { Metadata } from "next";
import { HeroSection } from "@/components/HeroSection";
import { IntroStrip } from "@/components/IntroStrip";
import { CaseStudyShowcase } from "@/components/CaseStudyShowcase";
import { HeritageInterlude } from "@/components/HeritageInterlude";
import { ServicesGrid } from "@/components/ServicesGrid";
import { NeighborhoodCards } from "@/components/NeighborhoodCards";
import { CTABanner } from "@/components/CTABanner";

export const metadata: Metadata = {
  // Self-canonical for the homepage. Relative "/" resolves against the
  // metadataBase set in the marketing layout.
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <HeroSection />
      <IntroStrip />
      <CaseStudyShowcase />
      <HeritageInterlude />
      <ServicesGrid />
      <NeighborhoodCards />
      <CTABanner />
    </>
  );
}
