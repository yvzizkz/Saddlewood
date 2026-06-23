import { neighborhoods } from "@/lib/neighborhoods";
import { NeighborhoodPage } from "@/components/NeighborhoodPage";
import type { Metadata } from "next";

const data = neighborhoods["arcadia"];

export const metadata: Metadata = {
  title: "Arcadia Remodeling Contractor | Elevate Your Scottsdale Home",
  description:
    "Saddlewood Contracting in Arcadia (85251) offers luxury kitchen, bath, and whole-home remodels. With 4 ROC licenses & in-house trades, we ensure quality. Book a free consultation: (480) 999-6100.",
  keywords: [
    "Arcadia home remodel",
    "Scottsdale luxury renovation",
    "85251 kitchen remodeling",
    "Arcadia bathroom design",
    "Scottsdale whole-home contractor",
    "Arcadia outdoor living",
  ],
  alternates: {
    canonical: "/neighborhoods/arcadia",
  },
  openGraph: {
    title: "Arcadia Remodeling | Saddlewood Contracting",
    description: "Saddlewood Contracting brings trusted, in-house craftsmanship to luxury kitchen, bath, and whole-home remodels for discerning homeowners in Arcadia, Scottsdale.",
    images: [{ url: data.heroImage, alt: "Arcadia luxury remodel by Saddlewood Contracting" }],
  },
};

export default function ArcadiaPage() {
  return <NeighborhoodPage data={data} />;
}
