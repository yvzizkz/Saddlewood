import type { Metadata } from "next";
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
    images: [
      {
        url: "/images/pv-aerial-sunset.jpg",
        alt: "Saddlewood Contracting luxury home remodeling",
      },
    ],
  },
};

export default function NeighborhoodsHubPage() {
  return (
    <>
      <PageHero
        label="Areas We Serve"
        title="Scottsdale & Paradise Valley"
        description="From lakeside properties to custom mountain estates, we deliver exceptional design-build remodeling services across the Valley's premier communities."
      />
      <NeighborhoodsGrid />
      <CTABanner />
    </>
  );
}
