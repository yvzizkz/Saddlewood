// An address to a point on the map, on the server, for crew_jobs.geo. The US
// Census geocoder first (free, no key, covers every street address in the
// country), Nominatim (OpenStreetMap) when the Census has nothing. Eight
// seconds each; any failure is null, never a throw, so a job is always saved
// whether or not it could be placed.

export type Geocoded = { lat: number; lng: number; source: "census" | "nominatim" };

const TIMEOUT_MS = 8_000;
const USER_AGENT = "SaddlewoodBot/1.0 (info@saddlewoodcontracting.com)";

export function censusUrl(address: string): string {
  return `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
}

export function nominatimUrl(address: string): string {
  return `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
}

function onThePlanet(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
}

/** The first match of a Census "onelineaddress" answer: coordinates.x is the longitude, y the latitude. */
export function parseCensus(json: unknown): { lat: number; lng: number } | null {
  const result = (json as { result?: { addressMatches?: unknown } } | null)?.result;
  const matches = result?.addressMatches;
  if (!Array.isArray(matches) || !matches.length) return null;
  const c = (matches[0] as { coordinates?: { x?: unknown; y?: unknown } })?.coordinates;
  const lat = Number(c?.y);
  const lng = Number(c?.x);
  return onThePlanet(lat, lng) ? { lat, lng } : null;
}

/** The first row of a Nominatim search: lat and lon come back as strings. */
export function parseNominatim(json: unknown): { lat: number; lng: number } | null {
  if (!Array.isArray(json) || !json.length) return null;
  const row = json[0] as { lat?: unknown; lon?: unknown };
  const lat = Number(row?.lat);
  const lng = Number(row?.lon);
  return onThePlanet(lat, lng) ? { lat, lng } : null;
}

/**
 * The address as the geocoders want it. Saddlewood works in Arizona and the
 * crew types "12729 W Keim Dr, Glendale": without a state or a ZIP the Census
 * finds nothing, so ", AZ" is added when neither is there.
 */
export function normalizeAddress(address: string): string {
  const one = address.replace(/\s+/g, " ").trim().replace(/[,\s]+$/, "");
  if (!one) return "";
  // A ZIP is at the end; a house number ("12729 W Keim Dr") is not one.
  const hasState = /\b(AZ|Arizona)\b/i.test(one) || /\b\d{5}(-\d{4})?$/.test(one);
  return hasState ? one : `${one}, AZ`;
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The address without its unit: "7740 E Gainey Ranch Rd #12, Scottsdale, AZ
 * 85258" -> "7740 E Gainey Ranch Rd, Scottsdale, AZ 85258". Both services miss
 * a condo or an apartment when the unit rides along; the building is close
 * enough for "how far was the punch".
 */
export function withoutUnit(address: string): string {
  return address
    .replace(/\s*(?:#|\b(?:unit|apt|apartment|ste|suite)\b\.?)\s*[A-Za-z0-9-]+/i, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function lookup(q: string): Promise<Geocoded | null> {
  try {
    const hit = parseCensus(await getJson(censusUrl(q), {}));
    if (hit) return { ...hit, source: "census" };
  } catch {
    // fall through to Nominatim
  }
  try {
    const hit = parseNominatim(await getJson(nominatimUrl(q), { "User-Agent": USER_AGENT }));
    if (hit) return { ...hit, source: "nominatim" };
  } catch {
    // nothing found, nothing thrown
  }
  return null;
}

/** Where an address is, or null when neither service could say. Never throws. A miss is tried once more without the unit. */
export async function geocodeAddress(address: string): Promise<Geocoded | null> {
  if (address.trim().length < 5) return null; // not an address
  const q = normalizeAddress(address);
  const hit = await lookup(q);
  if (hit) return hit;
  const bare = withoutUnit(q);
  return bare !== q && bare.length >= 5 ? lookup(bare) : null;
}
