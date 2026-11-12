import { describe, expect, it } from "vitest";
import { interpolateScene, sampleHeight, siteSky, terrainRadius } from "./scene-geometry";
import type { SceneSample } from "./scene-geometry";
import { Vector3 } from "three";

describe("topography and orbital interpolation", () => {
  it("samples across the longitude seam and assigns a single height at each pole", () => {
    const grid = new Int16Array(Array.from({ length: 32 }, (_, index) => index));
    expect(sampleHeight(grid, -35, -180, 8, 4)).toBe(sampleHeight(grid, -35, 180, 8, 4));
    expect(sampleHeight(grid, -90, 0, 8, 4)).toBe(sampleHeight(grid, -90, 100, 8, 4));
    expect(sampleHeight(grid, 90, -70, 8, 4)).toBe(3.5);
    const near = Math.abs(sampleHeight(grid, -89.999, -120, 8, 4) - sampleHeight(grid, -89.999, 120, 8, 4));
    expect(near).toBeLessThan(.001);
  });
  it("displaces the actual mesh radius and applies only the requested display exaggeration", () => {
    const grid = new Int16Array(1440 * 720).fill(1000);
    const point = { latitude_deg: -35, longitude_deg_east: 10 };
    expect(terrainRadius(grid, point, 1)).toBeCloseTo(2 * (1 + 1000 / 1737400), 12);
    expect((terrainRadius(grid, point, 6) - 2) / (terrainRadius(grid, point, 1) - 2)).toBeCloseTo(6, 10);
  });
  it("moves the Moon while interpolating orientation and UTC time without quaternion flips", () => {
    const a: SceneSample = { time_utc: "2028-10-01T00:00:00Z", moon_from_earth_km: [400000, 0, 0], sun_from_earth_km: [150000000, 0, 0], moon_orientation: [0, 0, 0, 1], earth_orientation: [0, 0, 0, 1] };
    const b: SceneSample = { ...a, time_utc: "2028-10-01T02:00:00Z", moon_from_earth_km: [0, 0, 400000], moon_orientation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], earth_orientation: [0, 0, 0, -1] };
    const middle = interpolateScene([a, b], .5);
    expect(middle.moon.toArray()).toEqual([200000, 0, 200000]);
    expect(middle.time.toISOString()).toBe("2028-10-01T01:00:00.000Z");
    expect(middle.earthRotation.length()).toBeCloseTo(1, 12);
    expect(new Vector3(1, 0, 0).applyQuaternion(middle.moonRotation).x).toBeCloseTo(Math.SQRT1_2, 12);
  });
  it("projects observer-relative bodies into east, north and up including lunar parallax", () => {
    const sample: SceneSample = { time_utc: "2028-10-01T00:00:00Z", moon_from_earth_km: [0, 0, 400000], sun_from_earth_km: [150000000, 0, 400000], moon_orientation: [0, 0, 0, 1], earth_orientation: [0, 0, 0, 1] };
    const sky = siteSky(interpolateScene([sample], 0), { latitude_deg: 0, longitude_deg_east: 0 });
    expect(sky.earth.elevation).toBeCloseTo(90, 8);
    expect(sky.sun.azimuth).toBeCloseTo(90, 8);
    expect(sky.sun.elevation).toBeLessThan(0);
    const opposite = siteSky(interpolateScene([sample], 0), { latitude_deg: 0, longitude_deg_east: 180 });
    expect(opposite.earth.elevation).toBeCloseTo(-90, 8);
  });
  it("keeps local bearings finite at both poles and accounts for lunar rotation", () => {
    const sample: SceneSample = { time_utc: "2028-10-01T00:00:00Z", moon_from_earth_km: [400000, 0, 0], sun_from_earth_km: [150000000, 0, 0], moon_orientation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], earth_orientation: [0, 0, 0, 1] };
    const display = interpolateScene([sample], 0);
    expect(siteSky(display, { latitude_deg: 0, longitude_deg_east: 0 }).earth.elevation).toBeCloseTo(90, 8);
    for (const lat of [-90, 90]) {
      const sky = siteSky(display, { latitude_deg: lat, longitude_deg_east: 20 });
      expect(Number.isFinite(sky.earth.azimuth)).toBe(true);
      expect(sky.earth.elevation).toBeLessThan(0);
    }
  });
});
