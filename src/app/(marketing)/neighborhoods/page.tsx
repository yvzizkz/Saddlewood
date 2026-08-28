import type { Metadata } from "next";
import Image from "next/image";
import { PageHero } from "@/components/PageHero";
import { NeighborhoodsGrid } from "@/components/NeighborhoodsGrid";
import { CTABanner } from "@/components/CTABanner";

export const metadata: Metadata = {
  title: "Areas We Serve | Scottsdale & Paradise Valley Remodeling | Saddlewood",
  description:
    "Saddlewood Contracting serves Scottsdale and Paradise Valley's premier neighborhoods. Explore our service areas and custom design-build remodeling projects.",
  keywords: [
    "Scottsdale remodeling contractor",
    "Paradise Valley home builder",
    "Scottsdale custom remodels",
    "Phoenix metro remodeling",
    "Saddlewood contracting areas",
  ],
  alternates: {
    canonical: "/neighborhoods",
  },
  openGraph: {
    title: "Areas We Serve | Saddlewood Contracting",
    description:
      "Explore the premier neighborhoods we serve across Scottsdale and Paradise Valley. High-end custom home remodels with dedicated, in-house crews.",
  },
};

export default function NeighborhoodsHubPage() {
  return (
    <>
      <PageHero
        label="Areas We Serve"
        title="Scottsdale & Paradise Valley"
        description="From lakeside properties to custom mountain estates, we deliver exceptional design-build remodeling services across the Valley's premier communities."
        variant="cream"
      />

      {/* One media moment — the only imagery allowed on Areas pages:
          the address-free garage-side render, plated on the cream ground */}
      <section
        className="night-on-cream relative bg-off-white pb-[clamp(64px,9vh,104px)]"
        aria-label="Estate rendering"
      >
        <div className="night-cream-grid" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
          <figure className="mx-auto my-0 max-w-[760px] border border-charcoal/[0.18] bg-white p-2.5 sm:p-3">
            <Image
              src="/images/render-garage.jpg"
              alt="Rendering of the garage side of the estate in progress"
              width={493}
              height={263}
              sizes="(min-width: 800px) 736px, 100vw"
              className="block h-auto w-full"
            />
            <figcaption className="px-1 pb-1 pt-3 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-charcoal-light">
              Rendering · Estate in progress, Paradise Valley
            </figcaption>
          </figure>
        </div>
      </section>

      <NeighborhoodsGrid />
      <CTABanner />
    </>
  );
}
