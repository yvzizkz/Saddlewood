import { neighborhoods } from "@/lib/neighborhoods";
import { NeighborhoodPage } from "@/components/NeighborhoodPage";
import type { Metadata } from "next";

const data = neighborhoods["dc-ranch"];

export const metadata: Metadata = {
  title: "DC Ranch Remodeling Contractor | Elevate Your Scottsdale Home",
  description:
    "Saddlewood Contracting brings luxury design-build remodels to DC Ranch, Scottsdale (85255). With 4 in-house ROC licenses (GC, Elec, HVAC, Plumb), we ensure seamless projects. Book a free consultation: (480) 999-6100.",
  keywords: [
    "DC Ranch remodeler",
    "Scottsdale luxury kitchen",
    "85255 home renovation",
    "DC Ranch custom remodel",
    "Scottsdale design-build",
    "DC Ranch bathroom remodel",
  ],
  alternates: {
    canonical: "/neighborhoods/dc-ranch",
  },
  openGraph: {
    title: "DC Ranch Remodeling | Saddlewood Contracting",
    description: "Elevate your DC Ranch home with Saddlewood Contracting's refined design-build remodels and comprehensive in-house expertise.",
  },
};

export default function DcRanchPage() {
  return <NeighborhoodPage data={data} />;
}
