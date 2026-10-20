import { afterEach, describe, expect, it, vi } from "vitest";

import { censusUrl, geocodeAddress, nominatimUrl, normalizeAddress, parseCensus, parseNominatim, withoutUnit } from "../geocode";

// The geocoders' answers, as they come back, and what is made of them. The
// network is never touched: fetch is a stand-in that answers from fixtures.

const CENSUS_HIT = {
  result: {
    input: { address: { address: "12729 W Keim Dr, Glendale, AZ" } },
    addressMatches: [
      {
        matchedAddress: "12729 W KEIM DR, GLENDALE, AZ, 85307",
        coordinates: { x: -112.33481, y: 33.61094 },
        tigerLine: { side: "L", tigerLineId: "1" },
      },
    ],
  },
};
const CENSUS_MISS = { result: { input: {}, addressMatches: [] } };
const NOMINATIM_HIT = [{ place_id: 1, lat: "33.6109400", lon: "-112.3348100", display_name: "12729, West Keim Drive, Glendale, AZ" }];

type Reply = { ok: boolean; json?: unknown; throws?: boolean };

function stubFetch(replies: Record<string, Reply>): { calls: { url: string; headers: Record<string, string> }[] } {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const host = new URL(url).host;
    const reply = replies[host];
    if (!reply) throw new Error(`unexpected call to ${host}`);
    if (reply.throws) throw new TypeError("fetch failed");
    return { ok: reply.ok, status: reply.ok ? 200 : 503, json: async () => reply.json };
  });
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading the geocoders", () => {
  it("takes the first Census match, x as longitude and y as latitude", () => {
    expect(parseCensus(CENSUS_HIT)).toEqual({ lat: 33.61094, lng: -112.33481 });
    expect(parseCensus(CENSUS_MISS)).toBeNull();
    expect(parseCensus(null)).toBeNull();
    expect(parseCensus({ result: { addressMatches: [{ coordinates: { x: "east", y: 1 } }] } })).toBeNull();
  });

  it("takes the first Nominatim row, lat and lon as strings", () => {
    expect(parseNominatim(NOMINATIM_HIT)).toEqual({ lat: 33.61094, lng: -112.33481 });
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim({ error: "Unable to geocode" })).toBeNull();
    expect(parseNominatim([{ lat: "0", lon: "0" }])).toBeNull();
  });

  it("adds the state when the address has neither a state nor a ZIP", () => {
    expect(normalizeAddress("12729 W Keim Dr, Glendale")).toBe("12729 W Keim Dr, Glendale, AZ");
    expect(normalizeAddress("12729 W Keim Dr, Glendale, AZ 85307")).toBe("12729 W Keim Dr, Glendale, AZ 85307");
    expect(normalizeAddress("6402 E Bambi Drive, Paradise Valley, Arizona")).toBe("6402 E Bambi Drive, Paradise Valley, Arizona");
    expect(normalizeAddress("  4201 N 7th St,   Phoenix 85014 ")).toBe("4201 N 7th St, Phoenix 85014");
    expect(normalizeAddress("")).toBe("");
  });

  it("builds the two URLs with the address escaped", () => {
    expect(censusUrl("12729 W Keim Dr, Glendale, AZ")).toBe(
      "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=12729%20W%20Keim%20Dr%2C%20Glendale%2C%20AZ&benchmark=Public_AR_Current&format=json",
    );
    expect(nominatimUrl("12729 W Keim Dr, Glendale, AZ")).toBe("https://nominatim.openstreetmap.org/search?q=12729%20W%20Keim%20Dr%2C%20Glendale%2C%20AZ&format=json&limit=1");
  });
});

describe("placing an address", () => {
  it("is the Census first, and never asks Nominatim when it answers", async () => {
    const { calls } = stubFetch({ "geocoding.geo.census.gov": { ok: true, json: CENSUS_HIT } });
    expect(await geocodeAddress("12729 W Keim Dr, Glendale")).toEqual({ lat: 33.61094, lng: -112.33481, source: "census" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("Glendale%2C%20AZ");
  });

  it("falls back to Nominatim, with the app named in the User-Agent", async () => {
    const { calls } = stubFetch({
      "geocoding.geo.census.gov": { ok: true, json: CENSUS_MISS },
      "nominatim.openstreetmap.org": { ok: true, json: NOMINATIM_HIT },
    });
    expect(await geocodeAddress("12729 W Keim Dr, Glendale, AZ")).toEqual({ lat: 33.61094, lng: -112.33481, source: "nominatim" });
    expect(calls.map((c) => new URL(c.url).host)).toEqual(["geocoding.geo.census.gov", "nominatim.openstreetmap.org"]);
    expect(calls[1].headers["User-Agent"]).toBe("SaddlewoodBot/1.0 (info@saddlewoodcontracting.com)");
  });

  it("is null, never a throw, when a service is down, answers badly, or finds nothing", async () => {
    stubFetch({ "geocoding.geo.census.gov": { ok: false }, "nominatim.openstreetmap.org": { ok: true, json: [] } });
    expect(await geocodeAddress("12729 W Keim Dr, Glendale, AZ")).toBeNull();
    stubFetch({ "geocoding.geo.census.gov": { ok: true, throws: true }, "nominatim.openstreetmap.org": { ok: true, throws: true } });
    expect(await geocodeAddress("12729 W Keim Dr, Glendale, AZ")).toBeNull();
    stubFetch({ "geocoding.geo.census.gov": { ok: true, json: "<html>" }, "nominatim.openstreetmap.org": { ok: true, json: { error: "x" } } });
    expect(await geocodeAddress("12729 W Keim Dr, Glendale, AZ")).toBeNull();
  });

  it("does not bother the services with nothing", async () => {
    const { calls } = stubFetch({});
    expect(await geocodeAddress("   ")).toBeNull();
    expect(await geocodeAddress("x")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("withoutUnit", () => {
  it("drops a unit so a condo road can be found", () => {
    expect(withoutUnit("7740 E Gainey Ranch Rd #12, Scottsdale, AZ 85258")).toBe("7740 E Gainey Ranch Rd, Scottsdale, AZ 85258");
    expect(withoutUnit("2402 E Esplanade Ln #1102, Phoenix, AZ")).toBe("2402 E Esplanade Ln, Phoenix, AZ");
    expect(withoutUnit("7425 E Gainey Ranch Unit 45, Scottsdale, AZ")).toBe("7425 E Gainey Ranch, Scottsdale, AZ");
    expect(withoutUnit("100 Main St Suite 200, Mesa, AZ 85201")).toBe("100 Main St, Mesa, AZ 85201");
  });
  it("leaves an address without a unit alone", () => {
    expect(withoutUnit("12729 W Keim Dr, Litchfield Park, AZ 85340")).toBe("12729 W Keim Dr, Litchfield Park, AZ 85340");
  });
});
