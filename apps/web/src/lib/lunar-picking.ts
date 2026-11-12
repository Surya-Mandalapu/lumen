/** Shared scene convention: +Y north, +X 90°E, -Z prime meridian. */
export const NASA_MOON_AXES = [-1, 1, 1] as const;

/** Great-circle boundary; independent of the polar projection used by detailed data. */
export function lunarCircle(latitude: number, longitude: number, radiusKm: number): [number, number, number][] {
  const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
  const angle = radiusKm / 1737.4;
  return Array.from({ length: 97 }, (_, index) => {
    const bearing = index / 96 * 2 * Math.PI;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(bearing));
    const nextLon = lon + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(lat), Math.cos(angle) - Math.sin(lat) * Math.sin(nextLat));
    return lunarPoint(nextLat * 180 / Math.PI, nextLon * 180 / Math.PI, 2.009);
  });
}

export function lunarPoint(latitude: number, longitude: number, radius = 2.016): [number, number, number] {
  const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
  return [radius * Math.cos(lat) * Math.sin(lon), radius * Math.sin(lat), -radius * Math.cos(lat) * Math.cos(lon)];
}
export function lunarCoordinate(x: number, y: number, z: number) {
  const radius = Math.hypot(x, y, z);
  if (!Number.isFinite(radius) || radius === 0) return null;
  return {
    latitude_deg: Math.asin(Math.max(-1, Math.min(1, y / radius))) * 180 / Math.PI,
    longitude_deg_east: ((Math.atan2(x, -z) * 180 / Math.PI + 540) % 360) - 180,
  };
}

/** A center-to-edge drag uses the same spherical radius as candidate membership. */
export function lunarDragRadius(center: { latitude_deg: number; longitude_deg_east: number }, edge: { latitude_deg: number; longitude_deg_east: number }, maximumKm: number) {
  const radians = Math.PI / 180;
  const a = center.latitude_deg * radians, b = edge.latitude_deg * radians;
  const h = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin((edge.longitude_deg_east - center.longitude_deg_east) * radians / 2) ** 2;
  const rawKm = 2 * 1737.4 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
  return { radiusKm: Math.max(1, Math.min(maximumKm, rawKm)), limited: rawKm > maximumKm };
}
