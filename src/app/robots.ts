import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://saddlewoodcontracting.com";

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
      // Explicitly welcome AI answer engines (AEO): we WANT to be crawled + cited.
      { userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Amazonbot", "CCBot"], allow: "/" },
      // Block the abusive scraper with no citation upside.
      { userAgent: ["Bytespider"], disallow: "/" },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
