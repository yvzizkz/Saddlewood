import { neighborhoods } from "@/lib/neighborhoods";
import { NeighborhoodPage } from "@/components/NeighborhoodPage";
import type { Metadata } from "next";

const data = neighborhoods["gainey-ranch"];

export const metadata: Metadata = {
  title: "Gainey Ranch Remodeling Contractor | Luxury Kitchen & Bath",
  description:
    "Luxury remodeling in Gainey Ranch, Scottsdale AZ 85258. Experienced with architectural review process and guard-gated protocols. Kitchen, bathroom, and whole-home renovation. Call (480) 999-6100.",
  keywords: [
    "Gainey Ranch remodeling",
    "Gainey Ranch contractor",
    "Gainey Ranch kitchen remodel",
    "Gainey Ranch bathroom renovation",
    "luxury remodeling 85258",
    "Scottsdale luxury contractor",
  ],
  alternates: {
    canonical: "/neighborhoods/gainey-ranch",
  },
  openGraph: {
    title: "Gainey Ranch Remodeling | Saddlewood Contracting",
    description: `${data.tagline}. Premium remodeling by Scottsdale's most trusted contractor.`,
    images: [{ url: data.heroImage, alt: "Gainey Ranch kitchen remodel by Saddlewood Contracting" }],
  },
};

export default function GaineyRanchPage() {
  return <NeighborhoodPage data={data} />;
}
