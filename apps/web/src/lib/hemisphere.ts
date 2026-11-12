export type LunarCoordinate = { latitude_deg: number; longitude_deg_east: number };
export const DISCOVERY_REGIONS = [
  { id: "near", name: "Near-side midlatitudes", latitude_deg: -35, longitude_deg_east: 0, interest: "earth", tag: "Coarse preview", why: "Start on the Earth-facing side. Check actual line of sight for your mission dates." },
  { id: "far", name: "Far-side midlatitudes", latitude_deg: -35, longitude_deg_east: -180, interest: "explore", tag: "Coarse preview", why: "Explore terrain facing away from Earth. Direct Earth access is limited; relay links are not modeled." },
  { id: "polar", name: "South polar region", latitude_deg: -89.9, longitude_deg_east: 0, interest: "sun", tag: "Detailed sites available", why: "Compare local terrain and date-specific sunlight using prepared polar data." },
] as const;

export function southernCoordinate(point: LunarCoordinate) {
  return Number.isFinite(point.latitude_deg) && Number.isFinite(point.longitude_deg_east)
    && point.latitude_deg >= -90 && point.latitude_deg <= 0
    && point.longitude_deg_east >= -180 && point.longitude_deg_east < 180;
}
export function coordinateLabel(point: LunarCoordinate) {
  return `${Math.abs(point.latitude_deg).toFixed(3)}°S · ${Math.abs(point.longitude_deg_east).toFixed(3)}°${point.longitude_deg_east < 0 ? "W" : "E"}`;
}
export function readSavedAreas(): LunarCoordinate[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem("lumen-southern-areas") ?? "[]");
    return Array.isArray(saved) ? saved.filter(item => item && southernCoordinate(item)).slice(0, 6) : [];
  } catch { return []; }
}
