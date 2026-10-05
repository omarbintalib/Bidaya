/** Great-circle distance in km between two points (haversine, mean Earth radius). */
export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Length in km of a path given as [lon, lat] points, optionally only up to point `upTo` (inclusive). */
export function pathKm(coords: [number, number][], upTo = coords.length - 1) {
  let total = 0;
  for (let i = 1; i <= upTo && i < coords.length; i++) total += km({ lon: coords[i - 1][0], lat: coords[i - 1][1] }, { lon: coords[i][0], lat: coords[i][1] });
  return total;
}

/** A distance rounded for reading: to 10 km under 1,000 km, to 50 km above. */
export const roundKm = (d: number) => (d < 1000 ? Math.round(d / 10) * 10 : Math.round(d / 50) * 50);
