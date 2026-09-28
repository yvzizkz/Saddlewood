import { describe, expect, it } from "vitest";

// Test the path classification logic used by middleware
function isGuarded(pathname: string): boolean {
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/videos") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return false;
  }

  return (
    pathname.startsWith("/r/") ||
    pathname === "/r" ||
    pathname.startsWith("/review/") ||
    pathname === "/review" ||
    pathname.startsWith("/internal") ||
    pathname.startsWith("/api/review") ||
    pathname.startsWith("/api/ops") ||
    pathname.startsWith("/api/estimates") ||
    pathname.startsWith("/api/trackers")
  );
}

describe("portal route security", () => {
  it("allows all public marketing pages to pass freely", () => {
    const publicPages = [
      "/",
      "/about",
      "/contact",
      "/services",
      "/framing",
      "/new-construction",
      "/neighborhoods",
      "/neighborhoods/paradise-valley",
      "/neighborhoods/silverleaf",
      "/portfolio",
      "/portfolio/desert-mountain-estate",
      "/trade-partners",
      "/careers",
      "/privacy",
      "/terms",
      "/llm-info",
      "/login",
      "/auth/confirm",
      "/auth/callback",
    ];

    for (const path of publicPages) {
      expect(isGuarded(path)).toBe(false);
    }
  });

  it("allows public static assets and public APIs", () => {
    const publicAssets = [
      "/images/logo.png",
      "/favicon.ico",
      "/robots.txt",
      "/sitemap.xml",
      "/_next/static/chunks/main.js",
      "/api/contact",
      "/api/trade-partners",
      "/api/careers",
      "/api/auth/send-link",
      "/api/auth/passkey",
    ];

    for (const path of publicAssets) {
      expect(isGuarded(path)).toBe(false);
    }
  });

  it("strictly guards all internal review batches and short links", () => {
    const guardedPages = [
      "/r/m1",
      "/r/m2",
      "/review/m1",
      "/review/m2",
      "/review/batch-3",
      "/internal",
      "/internal/ops",
      "/internal/estimates",
      "/internal/trackers",
      "/api/review",
      "/api/ops/cards",
      "/api/estimates/123",
      "/api/trackers/456",
    ];

    for (const path of guardedPages) {
      expect(isGuarded(path)).toBe(true);
    }
  });
});
