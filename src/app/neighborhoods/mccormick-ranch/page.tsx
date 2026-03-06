import { neighborhoods } from "@/lib/neighborhoods";
import { NeighborhoodPage } from "@/components/NeighborhoodPage";
import type { Metadata } from "next";

const data = neighborhoods["mccormick-ranch"];

export const metadata: Metadata = {
  title: "McCormick Ranch Remodeling Contractor | Kitchen & Bath Renovation",
  description:
    "Scottsdale's trusted McCormick Ranch remodeling contractor. Kitchen remodels, spa-inspired bathrooms, and whole-home renovations in 85258. 4 ROC licenses, in-house crews. Free consultation — call (480) 999-6100.",
  keywords: [
    "McCormick Ranch remodeling",
    "McCormick Ranch contractor",
    "McCormick Ranch kitchen remodel",
    "McCormick Ranch bathroom renovation",
    "remodeling contractor 85258",
    "Scottsdale kitchen remodel",
  ],
  alternates: {
    canonical: "/neighborhoods/mccormick-ranch",
  },
  openGraph: {
    title: "McCormick Ranch Remodeling | Saddlewood Contracting",
    description: `${data.tagline}. Premium remodeling by Scottsdale's most trusted contractor.`,
    images: [{ url: data.heroImage, alt: "McCormick Ranch kitchen remodel by Saddlewood Contracting" }],
  },
};

export default function McCormickRanchPage() {
  return <NeighborhoodPage data={data} />;
}
