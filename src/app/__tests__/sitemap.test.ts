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
