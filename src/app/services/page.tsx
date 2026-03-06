import { ServicesGrid } from "@/components/ServicesGrid";
import { ProcessTimeline } from "@/components/ProcessTimeline";
import { CTABanner } from "@/components/CTABanner";
import { PageHero } from "@/components/PageHero";

export const metadata = {
  title: "Remodeling Services in Scottsdale | Kitchen, Bath, Electrical, HVAC, Plumbing",
  description:
    "Full-service remodeling in Scottsdale, AZ — kitchen remodels, bathroom renovations, whole-home renovations, electrical, HVAC, and plumbing. 4 ROC licenses under one roof. Call (480) 999-6100.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        label="What We Do"
        title="Our Services"
        description="From full kitchen renovations to licensed specialty trades, we handle every aspect of your remodel under one roof."
        image="/images/wetbar.jpg"
        imageAlt="Custom wet bar remodel by Saddlewood Contracting in Scottsdale"
      />
      <ServicesGrid />
      <ProcessTimeline />
      <CTABanner />
    </>
  );
}
