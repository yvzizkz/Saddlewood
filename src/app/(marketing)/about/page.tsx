import type { Metadata } from "next";
import AboutContent from "./AboutContent";

export const metadata: Metadata = {
  title: { absolute: "About Saddlewood Contracting | Scottsdale's In-House Remodeling Team" },
  description:
    "Meet Saddlewood Contracting — Scottsdale remodeler with 4 ROC licenses (General, HVAC, Electrical, Plumbing) and in-house crews. No subcontractor coordination.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About Saddlewood Contracting | Scottsdale Remodeling",
    description:
      "Where Craftsmanship Meets Character. A Scottsdale remodeler with 4 ROC licenses and in-house crews — no subcontractor coordination headaches.",
    type: "website",
    // No per-page image override — inherits the site OG image.
  },
};

export default function AboutPage() {
  return <AboutContent />;
}
