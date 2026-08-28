import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // TEMPORARY HOLD (owner request, 2026-08-28): every marketing route 307s
  // to /under-construction while the redesign is finished. The portal,
  // review tooling, share links, auth, and API routes stay live. Remove by
  // reverting this commit when the new site ships.
  async redirects() {
    return [
      {
        source: "/",
        destination: "/under-construction",
        permanent: false,
      },
      {
        source:
          "/:path((?!api|auth|internal|login|review|r|share|under-construction|images|videos|_next|favicon|icon|robots|sitemap|manifest|llms).*)",
        destination: "/under-construction",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
