import type { CrewShift, Geo } from "./types";

// How far a punch was from the job. Pure: the distance is figured when the
// shifts are read for the owners and the Mac (src/lib/crew/home.ts), never
// stored, and never handed to the worker's own screens.

/** A punch this far from the job's address, or further, is flagged (half a mile). */
export const FAR_FROM_JOB_M = 805;
/** A phone fix looser than this says nothing about where the person was. */
export const GEO_MAX_ACC_M = 200;

export type LatLng = { lat: number; lng: number };
export type FromJob = CrewShift["fromJobM"];

const EARTH_R_M = 6_371_000;
const M_PER_MILE = 1609.344;

/** Great-circle distance in meters (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rounded meters from a punch to the job; null with no fix, no job on the map, or a fix too loose to trust. */
function punchFromJob(punch: Geo | null, job: LatLng | null | undefined): number | null {
  if (!punch || !job) return null;
  if (punch.acc !== null && punch.acc > GEO_MAX_ACC_M) return null;
  return Math.round(distanceM(punch, job));
}

/** The in and out distances of a shift, given where its job is. */
export function fromJobOf(shift: Pick<CrewShift, "startGeo" | "endGeo">, job: LatLng | null | undefined): FromJob {
  return { in: punchFromJob(shift.startGeo, job), out: punchFromJob(shift.endGeo, job) };
}

/** `farM` is the owners' setting (crew.farFromJobM, src/lib/crew/settings.ts) when the screen has it; the constant otherwise. */
export function isFar(m: number | null, farM: number = FAR_FROM_JOB_M): boolean {
  return m !== null && m > farM;
}

/** "2.1 mi" */
export function milesText(m: number): string {
  return `${(m / M_PER_MILE).toFixed(1)} mi`;
}

/** What to say about a punch that was far: "In 2.1 mi from the job", "Out 3.4 mi from the job". Empty when neither was. */
export function farLabels(f: FromJob | undefined, farM: number = FAR_FROM_JOB_M): string[] {
  if (!f) return [];
  const out: string[] = [];
  if (isFar(f.in, farM)) out.push(`In ${milesText(f.in as number)} from the job`);
  if (isFar(f.out, farM)) out.push(`Out ${milesText(f.out as number)} from the job`);
  return out;
}
