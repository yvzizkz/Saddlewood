import { neighborhoods } from "@/lib/neighborhoods";
import { NeighborhoodPage } from "@/components/NeighborhoodPage";
import type { Metadata } from "next";

const data = neighborhoods["paradise-valley"];

export const metadata: Metadata = {
  title: "Paradise Valley Remodeling Contractor | Luxury Home Renovation",
  description:
    "Scottsdale's trusted Paradise Valley remodeling contractor. Whole-home renovations, luxury kitchens, and custom interiors in 85253. 4 ROC licenses, in-house crews. Free consultation — call (480) 999-6100.",
  keywords: [
    "Paradise Valley remodeling",
    "Paradise Valley contractor",
    "Paradise Valley home renovation",
    "Paradise Valley luxury remodel",
    "remodeling contractor 85253",
    "Scottsdale luxury contractor",
  ],
  alternates: {
    canonical: "/neighborhoods/paradise-valley",
  },
  openGraph: {
    title: "Paradise Valley Remodeling | Saddlewood Contracting",
    description: `${data.tagline}. Premium remodeling by Scottsdale's most trusted contractor.`,
  },
};

export default function ParadiseValleyPage() {
  return <NeighborhoodPage data={data} />;
}
