import { neighborhoods } from "@/lib/neighborhoods";
import { NeighborhoodPage } from "@/components/NeighborhoodPage";
import type { Metadata } from "next";

const data = neighborhoods["grayhawk"];

export const metadata: Metadata = {
  title: "Grayhawk Remodeling Contractor | Luxury Home Transformations",
  description:
    "Elevate your Grayhawk 85255 home with Saddlewood Contracting. Our 4 AZ ROC licenses (General, Electrical, HVAC, Plumbing) ensure expertise. Book a free consultation: (480) 999-6100.",
  keywords: [
    "Grayhawk remodel",
    "Scottsdale 85255 renovation",
    "Luxury kitchen Grayhawk",
    "Grayhawk bathroom remodel",
    "Scottsdale general contractor",
    "Whole home remodel Grayhawk",
  ],
  alternates: {
    canonical: "/neighborhoods/grayhawk",
  },
  openGraph: {
    title: "Grayhawk Remodeling | Saddlewood Contracting",
    description: "Saddlewood Contracting offers refined design-build remodeling services for luxury homes in Scottsdale's Grayhawk community.",
    images: [{ url: data.heroImage, alt: "Grayhawk luxury remodel by Saddlewood Contracting" }],
  },
};

export default function GrayhawkPage() {
  return <NeighborhoodPage data={data} />;
}
