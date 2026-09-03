import type { Metadata } from "next";
import { FullBleedHero } from "@/components/FullBleedHero";
import { NeighborhoodsGrid } from "@/components/NeighborhoodsGrid";
import { CTABanner } from "@/components/CTABanner";

export const metadata: Metadata = {
  title: "Areas We Serve | Scottsdale & Paradise Valley Remodeling",
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
      <FullBleedHero
        media={{
          kind: "image",
          src: "/images/neighborhoods-hero-panoramic.jpg",
          alt: "Panoramic dusk view across Scottsdale and Paradise Valley",
          kenBurns: true,
        }}
        label="Panoramic dusk view across Scottsdale and Paradise Valley"
        mediaCaption="Dusk panorama · Scottsdale & Paradise Valley"
        eyebrow="Areas We Serve"
        title={
          <>
            Scottsdale &amp;{" "}
            <em className="font-normal italic text-gold">Paradise Valley</em>
          </>
        }
        description="From lakeside properties to custom mountain estates, we deliver exceptional design-build remodeling services across the Valley's premier communities."
      />

      <NeighborhoodsGrid />
      <CTABanner />
    </>
  );
}
