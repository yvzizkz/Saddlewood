import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { JsonLd } from "@/components/JsonLd";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://saddlewoodcontracting.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Saddlewood Contracting | Luxury Remodeling in Scottsdale, AZ",
    template: "%s | Saddlewood Contracting",
  },
  description:
    "Where Craftsmanship Meets Character. Premium kitchen, bathroom, and whole-home remodeling in McCormick Ranch, Gainey Ranch, and Pinnacle Peak Country Club. 4 ROC licenses, one point of contact. Call (480) 999-6100.",
  keywords: [
    "Scottsdale remodeling contractor",
    "luxury kitchen remodel Scottsdale",
    "bathroom renovation Scottsdale AZ",
    "McCormick Ranch contractor",
    "McCormick Ranch remodeling",
    "Gainey Ranch contractor",
    "Gainey Ranch remodeling",
    "Pinnacle Peak Country Club contractor",
    "Pinnacle Peak remodeling",
    "Scottsdale general contractor",
    "Scottsdale kitchen remodel",
    "Scottsdale bathroom remodel",
    "whole home remodel Scottsdale",
    "luxury home renovation 85258",
    "luxury home renovation 85255",
    "licensed contractor Scottsdale",
    "ROC licensed contractor Arizona",
    "HVAC contractor Scottsdale",
    "electrical contractor Scottsdale",
    "plumbing contractor Scottsdale",
  ],
  authors: [{ name: "Saddlewood Contracting LLC" }],
  creator: "Saddlewood Contracting LLC",
  openGraph: {
    title: "Saddlewood Contracting | Luxury Remodeling in Scottsdale",
    description:
      "Where Craftsmanship Meets Character. Premium remodeling in Scottsdale's most prestigious neighborhoods — McCormick Ranch, Gainey Ranch, and Pinnacle Peak.",
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Saddlewood Contracting",
    images: [
      {
        url: "/images/mcr-kitchen-island-01.jpg",
        width: 1200,
        height: 630,
        alt: "Saddlewood Contracting — Luxury Kitchen Remodel in McCormick Ranch, Scottsdale",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Saddlewood Contracting | Luxury Remodeling in Scottsdale",
    description:
      "Premium kitchen, bathroom, and whole-home remodeling in Scottsdale's most prestigious neighborhoods.",
    images: ["/images/mcr-kitchen-island-01.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  verification: {
    // Add your Google Search Console verification code here
    // google: "your-verification-code",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="font-sans antialiased">
        <JsonLd />
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
