import { describe, expect, it, vi } from "vitest";

// The distance from a punch to the job, and what the owners see of it.

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => {
    throw new Error("no database in this test");
  },
}));

import { FAR_FROM_JOB_M, GEO_MAX_ACC_M, distanceM, farLabels, fromJobOf, isFar, milesText } from "../geo";
import { withJobDistance } from "../queries";

const KEIM = { lat: 33.6109, lng: -112.3348 }; // 12729 W Keim Dr, Glendale
const PHOENIX = { lat: 33.4484, lng: -112.074 }; // downtown Phoenix
const TEMPE = { lat: 33.4255, lng: -111.94 }; // Tempe

describe("distanceM", () => {
  it("is the great-circle distance in meters", () => {
    // One degree of latitude on a 6,371 km sphere.
    expect(Math.round(distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }))).toBe(111195);
    // Downtown Phoenix to Tempe is about 12.7 km.
    expect(Math.round(distanceM(PHOENIX, TEMPE) / 100) * 100).toBe(12700);
    expect(distanceM(KEIM, KEIM)).toBe(0);
    expect(distanceM(PHOENIX, TEMPE)).toBeCloseTo(distanceM(TEMPE, PHOENIX), 6);
  });

  it("says it in miles to one decimal, and calls half a mile far", () => {
    expect(milesText(805)).toBe("0.5 mi");
    expect(milesText(3380)).toBe("2.1 mi");
    expect(FAR_FROM_JOB_M).toBe(805);
    expect(isFar(805)).toBe(false);
    expect(isFar(806)).toBe(true);
    expect(isFar(null)).toBe(false);
  });
});

describe("how far a punch was from the job", () => {
  // 120 m north of the job, and 3.4 km west of it.
  const near = { lat: KEIM.lat + 0.00108, lng: KEIM.lng, acc: 25 };
  const far = { lat: KEIM.lat, lng: KEIM.lng - 0.0366, acc: 40 };

  it("measures the in and the out against the job", () => {
    const f = fromJobOf({ startGeo: near, endGeo: far }, KEIM);
    expect(f.in).toBeGreaterThan(110);
    expect(f.in).toBeLessThan(130);
    expect(f.out).toBeGreaterThan(3300);
    expect(f.out).toBeLessThan(3500);
    expect(isFar(f.in)).toBe(false);
    expect(isFar(f.out)).toBe(true);
    expect(farLabels(f)).toEqual(["Out 2.1 mi from the job"]);
  });

  it("is null without a punch location, without the job on the map, or with a fix too loose to trust", () => {
    expect(fromJobOf({ startGeo: null, endGeo: far }, KEIM)).toEqual({ in: null, out: expect.any(Number) });
    expect(fromJobOf({ startGeo: near, endGeo: far }, null)).toEqual({ in: null, out: null });
    expect(fromJobOf({ startGeo: near, endGeo: far }, undefined)).toEqual({ in: null, out: null });
    expect(fromJobOf({ startGeo: { ...far, acc: GEO_MAX_ACC_M + 1 }, endGeo: { ...far, acc: null } }, KEIM)).toEqual({ in: null, out: expect.any(Number) });
    expect(farLabels(fromJobOf({ startGeo: null, endGeo: null }, KEIM))).toEqual([]);
    expect(farLabels(undefined)).toEqual([]);
  });

  it("names both punches when both were far", () => {
    expect(farLabels({ in: 3380, out: 5472 })).toEqual(["In 2.1 mi from the job", "Out 3.4 mi from the job"]);
    expect(farLabels({ in: 400, out: 100 })).toEqual([]);
  });

  it("fills the shifts for the owners and the Mac from the jobs they are on", () => {
    const blank = { in: null, out: null };
    const shifts = [
      { id: 1, jobId: "keim", startGeo: near, endGeo: far, fromJobM: blank },
      { id: 2, jobId: "bambi", startGeo: near, endGeo: null, fromJobM: blank },
      { id: 3, jobId: "other", startGeo: far, endGeo: far, fromJobM: blank },
    ];
    const out = withJobDistance(shifts, [
      { id: "keim", geo: KEIM },
      { id: "bambi", geo: null },
    ]);
    expect(out.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(isFar(out[0].fromJobM.in)).toBe(false);
    expect(isFar(out[0].fromJobM.out)).toBe(true);
    expect(out[1].fromJobM).toEqual(blank);
    expect(out[2].fromJobM).toEqual(blank);
    // The rows handed in are not changed.
    expect(shifts[0].fromJobM).toEqual(blank);
  });
});
