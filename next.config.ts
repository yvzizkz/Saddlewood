import type { NextConfig } from "next";
import { getLegacyRedirectMap } from "./src/data/case-studies";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // The proposal PDF (src/lib/sales/pdf.ts) reads the logo from public/ at
  // run time; on Vercel a function only has the files it is told about.
  outputFileTracingIncludes: {
    "/api/sales/proposals/[docId]/pdf": ["./public/images/logo-roundel.png"],
    "/api/sales/proposals/[docId]/email": ["./public/images/logo-roundel.png"],
    "/api/sales/proposals/[docId]/sign": ["./public/images/logo-roundel.png"],
    "/d/[token]/pdf": ["./public/images/logo-roundel.png"],
    "/d/[token]/accept": ["./public/images/logo-roundel.png"],
  },
  async redirects() {
    // 301s from the 68 retired /portfolio/[slug] project pages to the
    // case study that absorbed each one. Sourced from case-studies.ts so
    // the map can't drift from the data.
    return getLegacyRedirectMap().map(({ source, destination }) => ({
      source,
      destination,
      permanent: true,
    }));
  },
};

export default nextConfig;
