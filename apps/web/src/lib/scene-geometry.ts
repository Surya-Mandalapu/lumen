import { Quaternion, Vector3 } from "three";
import type { LunarCoordinate } from "./hemisphere";
import { lunarPoint } from "./lunar-picking";

export interface SceneSite extends LunarCoordinate { id: string; score: number; rank?: number; illumination_fraction?: number; earth_visibility_fraction?: number }

/** Local geometric sky, with east +X, up +Y and north -Z. */
export function siteSky(display: ReturnType<typeof interpolateScene>, site: LunarCoordinate) {
  const lat = site.latitude_deg * Math.PI / 180, lon = site.longitude_deg_east * Math.PI / 180;
  const up = new Vector3(...lunarPoint(site.latitude_deg, site.longitude_deg_east, 1));
  const east = new Vector3(Math.cos(lon), 0, Math.sin(lon));
  const north = new Vector3(-Math.sin(lat) * Math.sin(lon), Math.cos(lat), Math.sin(lat) * Math.cos(lon));
  const inverse = display.moonRotation.clone().invert();
  const observer = up.clone().multiplyScalar(1737.4);
  const project = (vector: Vector3) => {
    const local = vector.applyQuaternion(inverse).sub(observer).normalize();
    const direction = new Vector3(local.dot(east), local.dot(up), -local.dot(north));
    return { direction, elevation: Math.asin(Math.max(-1, Math.min(1, direction.y))) * 180 / Math.PI,
      azimuth: (Math.atan2(direction.x, -direction.z) * 180 / Math.PI + 360) % 360 };
  };
  return { earth: project(display.moon.clone().negate()), sun: project(display.sun.clone().sub(display.moon)) };
}

export interface SceneSample {
  time_utc: string;
  moon_from_earth_km: [number, number, number];
  sun_from_earth_km: [number, number, number];
  moon_orientation: [number, number, number, number];
  earth_orientation: [number, number, number, number];
}
export interface SceneEphemeris { samples: SceneSample[]; provenance: { source: string; limits: string } }

export function sampleHeight(grid: Int16Array, lat: number, lon: number, width = 1440, height = 720) {
  const row = Math.max(0, Math.min(height - 1, (90 - lat) / 180 * height - .5));
  const col = ((lon + 180) / 360 * width - .5 + width) % width;
  const r = Math.floor(row), c = Math.floor(col), r2 = Math.min(height - 1, r + 1), c2 = (c + 1) % width;
  const a = col - c, b = row - r;
  if (Math.abs(lat) >= 89.999999) {
    const offset = lat > 0 ? 0 : (height - 1) * width;
    let sum = 0; for (let i = 0; i < width; i++) sum += grid[offset + i];
    return sum / width;
  }
  const value = (1 - b) * ((1 - a) * grid[r * width + c] + a * grid[r * width + c2]) + b * ((1 - a) * grid[r2 * width + c] + a * grid[r2 * width + c2]);
  // Beyond the last pixel center, interpolate to a single polar height instead
  // of extending longitude-dependent samples into a pinched vertex fan.
  const polarWeight = Math.max(0, (Math.abs(lat) - (90 - 90 / height)) / (90 / height));
  if (polarWeight > 0) {
    const offset = lat > 0 ? 0 : (height - 1) * width;
    let sum = 0; for (let i = 0; i < width; i++) sum += grid[offset + i];
    return value * (1 - polarWeight) + sum / width * polarWeight;
  }
  return value;
}
export function terrainRadius(grid: Int16Array, point: LunarCoordinate, exaggeration: number) {
  return 2 * (1 + sampleHeight(grid, point.latitude_deg, point.longitude_deg_east) * exaggeration / 1_737_400);
}
export function interpolateScene(samples: SceneSample[], fraction: number) {
  const index = Math.max(0, Math.min(samples.length - 1, fraction * (samples.length - 1)));
  const low = Math.floor(index), high = Math.min(samples.length - 1, low + 1), t = index - low;
  const a = samples[low], b = samples[high];
  return {
    time: new Date(Date.parse(a.time_utc) + (Date.parse(b.time_utc) - Date.parse(a.time_utc)) * t),
    moon: new Vector3(...a.moon_from_earth_km).lerp(new Vector3(...b.moon_from_earth_km), t),
    sun: new Vector3(...a.sun_from_earth_km).lerp(new Vector3(...b.sun_from_earth_km), t),
    moonRotation: new Quaternion(...a.moon_orientation).slerp(new Quaternion(...b.moon_orientation), t),
    earthRotation: new Quaternion(...a.earth_orientation).slerp(new Quaternion(...b.earth_orientation), t),
  };
}
