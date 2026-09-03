import type { NextConfig } from "next";
import { getLegacyRedirectMap } from "./src/data/case-studies";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
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
