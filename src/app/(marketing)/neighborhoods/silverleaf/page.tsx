import { neighborhoods } from "@/lib/neighborhoods";
import { NeighborhoodPage } from "@/components/NeighborhoodPage";
import type { Metadata } from "next";

const data = neighborhoods["silverleaf"];

export const metadata: Metadata = {
  title: "Silverleaf Remodeling Contractor | Luxury Home Transformations",
  description:
    "Saddlewood Contracting elevates Silverleaf (85255) homes. In-house General Contractor, Electrical, HVAC, Plumbing licenses ensure quality. Book a free consultation: (480) 999-6100.",
  keywords: [
    "Silverleaf remodeling",
    "Scottsdale luxury remodeler",
    "85255 home renovation",
    "Silverleaf kitchen remodel",
    "Scottsdale design-build",
    "high-end bathroom Silverleaf",
  ],
  alternates: {
    canonical: "/neighborhoods/silverleaf",
  },
  openGraph: {
    title: "Silverleaf Remodeling | Saddlewood Contracting",
    description: "Discover how Saddlewood Contracting brings refined craftsmanship and comprehensive in-house expertise to luxury home remodels in Scottsdale's esteemed Silverleaf community.",
  },
};

export default function SilverleafPage() {
  return <NeighborhoodPage data={data} />;
}
