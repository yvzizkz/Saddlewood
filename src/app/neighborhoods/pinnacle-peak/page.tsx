import { neighborhoods } from "@/lib/neighborhoods";
import { NeighborhoodPage } from "@/components/NeighborhoodPage";
import type { Metadata } from "next";

const data = neighborhoods["pinnacle-peak"];

export const metadata: Metadata = {
  title: "Pinnacle Peak Country Club Remodeling | Luxury Home Renovation",
  description:
    "Luxury remodeling in Pinnacle Peak Country Club, Scottsdale AZ 85255. Large-scale kitchen, bathroom, and whole-home renovations with desert contemporary expertise. Call (480) 999-6100.",
  keywords: [
    "Pinnacle Peak remodeling",
    "Pinnacle Peak Country Club contractor",
    "Pinnacle Peak kitchen remodel",
    "Pinnacle Peak bathroom renovation",
    "luxury remodeling 85255",
    "Scottsdale luxury home renovation",
  ],
  alternates: {
    canonical: "/neighborhoods/pinnacle-peak",
  },
  openGraph: {
    title: "Pinnacle Peak Remodeling | Saddlewood Contracting",
    description: `${data.tagline}. Premium remodeling by Scottsdale's most trusted contractor.`,
    images: [{ url: data.heroImage, alt: "Pinnacle Peak kitchen remodel by Saddlewood Contracting" }],
  },
};

export default function PinnaclePeakPage() {
  return <NeighborhoodPage data={data} />;
}
