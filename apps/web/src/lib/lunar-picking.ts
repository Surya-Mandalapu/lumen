/** Shared scene convention: +Y north, +X 90°E, -Z prime meridian. */
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
