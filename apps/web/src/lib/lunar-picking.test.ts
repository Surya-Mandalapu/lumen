import { describe, expect, it } from "vitest";
import { lunarCoordinate, lunarDragRadius, lunarPoint, NASA_MOON_AXES } from "./lunar-picking";
import { projectPolar, unprojectPolar } from "./coverage";
describe("3D point picking", () => {
  it("aligns NASA model longitudes with markers and east-positive analysis coordinates", () => {
    const transform = (x: number, y: number, z: number) => lunarCoordinate(x * NASA_MOON_AXES[0], y * NASA_MOON_AXES[1], z * NASA_MOON_AXES[2])!;
    expect(transform(1, 0, 0).longitude_deg_east).toBe(-90);
    expect(transform(-1, 0, 0).longitude_deg_east).toBe(90);
    expect(transform(0, 0, -1).longitude_deg_east).toBe(0);
    expect(transform(0, -1, 0).latitude_deg).toBe(-90);
  });
  it.each([[-89.9, 0], [-87, 90], [0, -179.9], [45, -90], [-90, 0]])("round trips lunar coordinates %s, %s", (latitude, longitude) => {
    const point = lunarPoint(latitude, longitude);
    const coordinate = lunarCoordinate(...point)!;
    expect(coordinate.latitude_deg).toBeCloseTo(latitude, 7);
    expect(coordinate.longitude_deg_east).toBeCloseTo(longitude, 7);
  });
  it("uses the same longitude direction as the south-pole terrain projection", () => {
    const [x, y] = projectPolar(-89, 90);
    const coordinate = unprojectPolar(x, y);
    const moon = lunarPoint(coordinate.latitude_deg, coordinate.longitude_deg_east);
    expect(moon[0]).toBeGreaterThan(0);
    expect(moon[1]).toBeLessThan(0);
    expect(moon[2]).toBeCloseTo(0);
    expect(lunarCoordinate(0, 0, 0)).toBeNull();
    expect(lunarCoordinate(Infinity, 0, 0)).toBeNull();
  });
  it("measures center-to-edge search drags across the seam and near the pole", () => {
    const result = lunarDragRadius({ latitude_deg: 0, longitude_deg_east: 179.99 }, { latitude_deg: 0, longitude_deg_east: -179.91 }, 5);
    expect(result.radiusKm).toBeCloseTo(1737.4 * Math.PI / 180 * .1, 8);
    expect(result.limited).toBe(false);
    const polar = lunarDragRadius({ latitude_deg: -89.95, longitude_deg_east: 0 }, { latitude_deg: -89.95, longitude_deg_east: 180 }, 5);
    expect(polar.radiusKm).toBeCloseTo(result.radiusKm, 8);
  });
  it("respects the supported search radius without misrepresenting a large drag", () => {
    expect(lunarDragRadius({ latitude_deg: -89, longitude_deg_east: 0 }, { latitude_deg: -80, longitude_deg_east: 0 }, 5)).toEqual({ radiusKm: 5, limited: true });
    expect(lunarDragRadius({ latitude_deg: -89, longitude_deg_east: 0 }, { latitude_deg: -89, longitude_deg_east: 0 }, 5)).toEqual({ radiusKm: 1, limited: false });
  });
});
