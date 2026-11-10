import type { LunarFeature, SearchRequest } from "./types";

const RADIUS_M = 1_737_400;
const radians = Math.PI / 180;
export function projectPolar(
  latitude: number,
  longitude: number,
): [number, number] {
  const rho = 2 * RADIUS_M * Math.tan(Math.PI / 4 + (latitude * radians) / 2);
  return [
    rho * Math.sin(longitude * radians),
    rho * Math.cos(longitude * radians),
  ];
}

export function unprojectPolar(x: number, y: number) {
  return {
    latitude_deg:
      (-Math.PI / 2 + 2 * Math.atan(Math.hypot(x, y) / (2 * RADIUS_M))) /
      radians,
    longitude_deg_east:
      ((((Math.atan2(x, y) / radians + 180) % 360) + 360) % 360) - 180,
  };
}

export function selectedCircle(
  region: SearchRequest["region"],
  features: LunarFeature[],
) {
  if (region.selector_type === "full_supported_region") return null;
  const feature =
    region.selector_type === "feature_radius"
      ? features.find((row) => row.id === region.resolved_feature_id)
      : undefined;
  // Match authoritative named-feature resolution; never trust a stale supplied center.
  const center =
    region.selector_type === "feature_radius" ? feature : region.center;
  if (
    !center ||
    !region.search_radius_km ||
    !Number.isFinite(region.search_radius_km)
  )
    return null;
  const [x, y] = projectPolar(center.latitude_deg, center.longitude_deg_east);
  return { x, y, radius: region.search_radius_km * 1000 };
}

// A display-only approximation in the local polar projection. Search membership
// remains the backend's exact spherical candidate-distance calculation.
export function footprintOverlap(
  circle: { x: number; y: number; radius: number },
  extent: [number, number, number, number],
) {
  const [xmin, ymin, xmax, ymax] = extent;
  if (
    circle.x - circle.radius >= xmin &&
    circle.x + circle.radius <= xmax &&
    circle.y - circle.radius >= ymin &&
    circle.y + circle.radius <= ymax
  )
    return "inside";
  const dx = Math.max(xmin - circle.x, 0, circle.x - xmax);
  const dy = Math.max(ymin - circle.y, 0, circle.y - ymax);
  return Math.hypot(dx, dy) > circle.radius ? "outside" : "partial";
}
