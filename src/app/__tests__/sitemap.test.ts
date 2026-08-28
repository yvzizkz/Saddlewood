import { describe, it, expect } from "vitest";
import sitemap from "../sitemap";

describe("sitemap", () => {
  it("includes new-construction and framing routes", () => {
    const urls = sitemap();
    
    const newConstructionEntry = urls.find(entry => entry.url.endsWith("/new-construction"));
    const framingEntry = urls.find(entry => entry.url.endsWith("/framing"));

    expect(newConstructionEntry).toBeDefined();
    expect(newConstructionEntry?.changeFrequency).toBe("monthly");
    expect(newConstructionEntry?.priority).toBe(0.9);

    expect(framingEntry).toBeDefined();
    expect(framingEntry?.changeFrequency).toBe("monthly");
    expect(framingEntry?.priority).toBe(0.9);
  });

  it("returns base sitemap configuration with priority 1 for home", () => {
    const urls = sitemap();
    const homeEntry = urls.find(entry => entry.url === "https://saddlewoodcontracting.com" || entry.url === process.env.NEXT_PUBLIC_SITE_URL);
    expect(homeEntry).toBeDefined();
    expect(homeEntry?.priority).toBe(1);
  });
});

describe("sitemap case studies", () => {
  it("includes every case study slug as a /portfolio/ entry", async () => {
    const { getAllCaseStudySlugs } = await import("@/data/case-studies");
    const urls = sitemap();
    for (const slug of getAllCaseStudySlugs()) {
      const entry = urls.find((e) => e.url.endsWith(`/portfolio/${slug}`));
      expect(entry, `missing sitemap entry for ${slug}`).toBeDefined();
      expect(entry?.priority).toBe(0.8);
    }
  });
});
