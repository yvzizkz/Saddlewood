import { ServicesGrid } from "@/components/ServicesGrid";
import { ProcessTimeline } from "@/components/ProcessTimeline";
import { CTABanner } from "@/components/CTABanner";

export const metadata = {
  title: "Remodeling Services in Scottsdale | Kitchen, Bath, Electrical, HVAC, Plumbing",
  description:
    "Full-service remodeling in Scottsdale, AZ — kitchen remodels, bathroom renovations, whole-home renovations, electrical, HVAC, and plumbing. 4 ROC licenses under one roof. Call (480) 999-6100.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[500px] flex items-end bg-teal-dark">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="max-w-2xl">
            <span className="text-gold text-sm tracking-[0.2em] uppercase font-light">
              What We Do
            </span>
            <h1 className="font-heading text-6xl lg:text-7xl font-light text-stone mt-6 mb-6 leading-tight">
              Our Services
            </h1>
            <p className="text-stone/70 max-w-2xl text-lg font-light leading-relaxed">
              From full kitchen renovations to licensed specialty trades, we handle every aspect of your remodel under one roof.
            </p>
          </div>
        </div>
      </section>

      <ServicesGrid />
      <ProcessTimeline />
      <CTABanner />
    </>
  );
}
