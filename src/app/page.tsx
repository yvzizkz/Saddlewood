import { HeroSection } from "@/components/HeroSection";
import { IntroStrip } from "@/components/IntroStrip";
import { WorkShowcase } from "@/components/WorkShowcase";
import { ServicesGrid } from "@/components/ServicesGrid";
import { NeighborhoodCards } from "@/components/NeighborhoodCards";
import { Testimonials } from "@/components/Testimonials";
import { CredentialsBar } from "@/components/CredentialsBar";
import { CTABanner } from "@/components/CTABanner";

export default function Home() {
  return (
    <>
      <HeroSection />
      <IntroStrip />
      <WorkShowcase />
      <ServicesGrid />
      <NeighborhoodCards />
      <Testimonials />
      <CredentialsBar />
      <CTABanner />
    </>
  );
}
