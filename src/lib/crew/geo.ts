/**
 * Pure GPS and Geofencing calculations (safe for both browser client and server runtimes).
 */

/**
 * Haversine formula to compute great-circle distance between two GPS coordinates in meters.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's mean radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Formats distance in feet or miles for worker readability.
 */
export function formatDistanceFeet(meters: number): string {
  const feet = Math.round(meters * 3.28084);
  if (feet < 5280) {
    return `${feet.toLocaleString()} ft`;
  }
  const miles = Math.round((feet / 5280) * 10) / 10;
  return `${miles} miles`;
}
