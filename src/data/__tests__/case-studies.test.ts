import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { caseStudies, getAllCaseStudySlugs, getCaseStudy, getLegacyRedirectMap } from "../case-studies";

// Frozen record of the retired projects.ts catalog (deleted in the redesign).
// The legacySlugs arrays across case-studies.ts ARE the redirect contract now;
// this count pins it so an accidental edit can't silently drop a 301.
const FROZEN_LEGACY_SLUG_COUNT = 68;
const getAllSlugs = () =>
  caseStudies.flatMap((study) => study.legacySlugs);

const ALLOWED_LINEWORK = ["plan-fragment", "massing", "wall-section", "steel-beam", "plat"];

const REAL_VIDEO_SRCS = [
  "/videos/breaking-ground-steel-9x16.mp4",
  "/videos/process-timeline-9x16.mp4",
  "/videos/stitched-reel-9x16.mp4",
];

const REAL_VIDEO_POSTERS = [
  "/videos/breaking-ground-steel-9x16-poster.jpg",
  "/videos/process-timeline-9x16-poster.jpg",
  "/videos/stitched-reel-9x16-poster.jpg",
];

describe("case studies", () => {
  it("absorbs every legacy portfolio slug in exactly one case study", () => {
    const legacySlugs = getAllSlugs();
    expect(legacySlugs.length).toBe(FROZEN_LEGACY_SLUG_COUNT);

    const counts = new Map<string, number>();
    for (const study of caseStudies) {
      for (const slug of study.legacySlugs) {
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }

    // Every legacy slug appears exactly once across all legacySlugs arrays.
    const missing = legacySlugs.filter((slug) => !counts.has(slug));
    const duplicated = legacySlugs.filter((slug) => (counts.get(slug) ?? 0) > 1);
    expect(missing).toEqual([]);
    expect(duplicated).toEqual([]);

    // And no case study claims a slug that never existed in projects.ts.
    const legacySet = new Set(legacySlugs);
    const unknown = [...counts.keys()].filter((slug) => !legacySet.has(slug));
    expect(unknown).toEqual([]);

    // Total coverage equals the legacy catalog size.
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    expect(total).toBe(legacySlugs.length);
  });

  it("has unique new slugs that do not collide with any legacy slug", () => {
    const newSlugs = getAllCaseStudySlugs();
    expect(new Set(newSlugs).size).toBe(newSlugs.length);

    const legacySet = new Set(getAllSlugs());
    const collisions = newSlugs.filter((slug) => legacySet.has(slug));
    expect(collisions).toEqual([]);
  });

  it("only references the three real /videos/ files for reels", () => {
    for (const study of caseStudies) {
      if (!study.reel) continue;
      expect(REAL_VIDEO_SRCS).toContain(study.reel.src);
      expect(REAL_VIDEO_POSTERS).toContain(study.reel.poster);

      // The files actually exist on disk.
      const publicDir = path.resolve(__dirname, "../../../public");
      expect(existsSync(path.join(publicDir, study.reel.src))).toBe(true);
      expect(existsSync(path.join(publicDir, study.reel.poster))).toBe(true);
    }
  });

  it("assigns at most one reel per study and never shares a reel between studies", () => {
    const used = caseStudies.filter((s) => s.reel).map((s) => s.reel!.src);
    expect(new Set(used).size).toBe(used.length);
  });

  it("uses only allowed linework registry keys", () => {
    for (const study of caseStudies) {
      expect(ALLOWED_LINEWORK).toContain(study.linework);
    }
  });

  it("looks up case studies by slug", () => {
    for (const study of caseStudies) {
      expect(getCaseStudy(study.slug)).toBe(study);
    }
    expect(getCaseStudy("does-not-exist")).toBeUndefined();
  });

  it("produces one redirect per legacy slug, targeting a real case study", () => {
    const redirects = getLegacyRedirectMap();
    expect(redirects.length).toBe(getAllSlugs().length);

    const sources = redirects.map((r) => r.source);
    expect(new Set(sources).size).toBe(sources.length);

    const newSlugSet = new Set(getAllCaseStudySlugs());
    for (const { source, destination } of redirects) {
      expect(source).toMatch(/^\/portfolio\/.+/);
      const destSlug = destination.replace("/portfolio/", "");
      expect(newSlugSet.has(destSlug)).toBe(true);
      // A redirect must never point back at a legacy URL.
      expect(source).not.toBe(destination);
    }
  });
});
